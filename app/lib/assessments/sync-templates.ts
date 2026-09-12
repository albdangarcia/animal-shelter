import { FieldType } from "@/prisma/generated/enums";
import {
  ASSESSMENT_TEMPLATES,
  validateRegistry,
  type AssessmentTemplateDef,
} from "./templates";

/**
 * The narrow write port the registry sync needs. The seed supplies a Prisma
 * -backed implementation; `sync-templates.test.ts` supplies an in-memory fake.
 * Keeping Prisma's types out of this module is what lets the sync be unit
 * -tested with no database.
 */
export interface TemplateRegistryStore {
  /**
   * Upsert one template row, keyed on `(key, version)`. Must return the row id
   * (existing or freshly created) so fields can be attached.
   */
  upsertTemplate(input: TemplateUpsert): Promise<{ id: string }>;
  /** Upsert one field row, keyed on `(templateId, key)`. */
  upsertField(input: FieldUpsert): Promise<void>;
  /**
   * The trait an existing field row already proposes, or null when the row
   * doesn't exist yet or proposes nothing.
   */
  findProposedCharacteristicId(
    templateId: string,
    key: string,
  ): Promise<string | null>;
  /**
   * Resolve a `Characteristic` catalog name to its row id, or null when no
   * such trait exists. Used to turn a registry field's `proposesCharacteristic`
   * name into the foreign key the row stores.
   */
  resolveCharacteristicId(name: string): Promise<string | null>;
}

export interface TemplateUpsert {
  key: string;
  version: number;
  name: string;
  description: string;
  species: string | null;
  stage: string | null;
  isActive: boolean;
}

export interface FieldUpsert {
  templateId: string;
  key: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  concerningValues: string[];
  isRequired: boolean;
  /** Position within the template, taken from registry declaration order. */
  order: number;
  /** Resolved from the registry's `proposesCharacteristic` name; null if unset. */
  proposesCharacteristicId: string | null;
  proposesOnValues: string[];
}

export interface SyncResult {
  templates: number;
  fields: number;
}

/**
 * Mirror the code-defined registry into whatever `store` is backed by, keyed
 * on `(key, version)` for templates and `(templateId, key)` for fields.
 *
 * Idempotent by construction: every write is an upsert on a natural key, and
 * declaration order is the only source of `order`, so running it twice against
 * the same registry converges on the same rows with no duplicates. It does not
 * delete rows for templates/fields that have left the registry — a removed
 * template is retired via `isActive: false` in the registry, and a
 * removed field would only ever happen through a version bump.
 *
 * A field row keeps the trait it already proposes: the registry's name is
 * resolved only when the row has no proposal yet. Recorded answers are matched
 * on that foreign key, so a trait renamed in the catalog since the row was
 * written stays linked, and the stale name in the registry doesn't abort the
 * sync.
 */
export async function syncTemplateRegistry(
  store: TemplateRegistryStore,
  templates: readonly AssessmentTemplateDef[] = ASSESSMENT_TEMPLATES,
): Promise<SyncResult> {
  const problems = validateRegistry(templates);
  if (problems.length > 0) {
    throw new Error(
      `Assessment template registry is invalid:\n  - ${problems.join("\n  - ")}`,
    );
  }

  let fieldCount = 0;

  for (const template of templates) {
    const { id } = await store.upsertTemplate({
      key: template.key,
      version: template.version,
      name: template.name,
      description: template.description,
      species: template.species ?? null,
      stage: template.stage ?? null,
      isActive: template.isActive ?? true,
    });

    for (const [order, field] of template.fields.entries()) {
      let proposesCharacteristicId: string | null = null;
      if (field.proposesCharacteristic) {
        proposesCharacteristicId =
          (await store.findProposedCharacteristicId(id, field.key)) ??
          (await store.resolveCharacteristicId(field.proposesCharacteristic));
        if (!proposesCharacteristicId) {
          throw new Error(
            `Assessment template "${template.key}@${template.version}" field "${field.key}" proposes characteristic "${field.proposesCharacteristic}", which is not in the catalog.`,
          );
        }
      }

      await store.upsertField({
        templateId: id,
        key: field.key,
        label: field.label,
        fieldType: field.fieldType,
        options: field.options ?? [],
        concerningValues: field.concerningValues ?? [],
        isRequired: field.isRequired ?? false,
        order,
        proposesCharacteristicId,
        proposesOnValues: field.proposesOnValues ?? [],
      });
      fieldCount += 1;
    }
  }

  return { templates: templates.length, fields: fieldCount };
}
