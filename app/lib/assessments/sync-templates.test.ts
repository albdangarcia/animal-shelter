// Unit tests for the registry -> DB sync, run against an in-memory fake of the
// write port so there is no database dependency (see the note in
// templates.test.ts about how `npm test` runs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FieldType } from "@/prisma/generated/enums";
import {
  syncTemplateRegistry,
  type FieldUpsert,
  type TemplateRegistryStore,
  type TemplateUpsert,
} from "./sync-templates";
import { ASSESSMENT_TEMPLATES, type AssessmentTemplateDef } from "./templates";

/**
 * A store that behaves like the real one's natural keys: templates keyed on
 * `(key, version)`, fields on `(templateId, key)`, ids handed out once and
 * reused on re-upsert.
 */
function makeFakeStore(
  options: { knownCharacteristics?: "all" | string[] } = {},
) {
  const templates = new Map<string, { id: string } & TemplateUpsert>();
  const fields = new Map<string, FieldUpsert>();
  let seq = 0;
  const calls = { upsertTemplate: 0, upsertField: 0, created: 0 };
  const known = options.knownCharacteristics ?? "all";

  const store: TemplateRegistryStore = {
    async resolveCharacteristicId(name) {
      if (known === "all" || known.includes(name)) {
        return `char_${name.replace(/\W+/g, "_")}`;
      }
      return null;
    },
    async upsertTemplate(input) {
      calls.upsertTemplate += 1;
      const naturalKey = `${input.key}@${input.version}`;
      const existing = templates.get(naturalKey);
      if (existing) {
        templates.set(naturalKey, { ...existing, ...input });
        return { id: existing.id };
      }
      calls.created += 1;
      const id = `tmpl_${(seq += 1)}`;
      templates.set(naturalKey, { id, ...input });
      return { id };
    },
    async upsertField(input) {
      calls.upsertField += 1;
      fields.set(`${input.templateId}::${input.key}`, input);
    },
    async findProposedCharacteristicId(templateId, key) {
      return fields.get(`${templateId}::${key}`)?.proposesCharacteristicId ?? null;
    },
  };

  return { store, templates, fields, calls };
}

const registryFieldCount = ASSESSMENT_TEMPLATES.reduce(
  (n, t) => n + t.fields.length,
  0,
);

test("a first sync writes every template and field in the registry", async () => {
  const { store, templates, fields } = makeFakeStore();
  const result = await syncTemplateRegistry(store);

  assert.equal(result.templates, ASSESSMENT_TEMPLATES.length);
  assert.equal(result.fields, registryFieldCount);
  assert.equal(templates.size, ASSESSMENT_TEMPLATES.length);
  assert.equal(fields.size, registryFieldCount);
});

test("a second sync is idempotent — no new rows, ids stable", async () => {
  const { store, templates, fields, calls } = makeFakeStore();
  await syncTemplateRegistry(store);
  const idsAfterFirst = [...templates.values()].map((t) => t.id).sort();
  const createdAfterFirst = calls.created;

  await syncTemplateRegistry(store);

  assert.equal(templates.size, ASSESSMENT_TEMPLATES.length);
  assert.equal(fields.size, registryFieldCount);
  assert.equal(
    calls.created,
    createdAfterFirst,
    "second run must not create any template row",
  );
  assert.deepEqual(
    [...templates.values()].map((t) => t.id).sort(),
    idsAfterFirst,
  );
});

test("field order follows registry declaration order", async () => {
  const { store, templates, fields } = makeFakeStore();
  await syncTemplateRegistry(store);

  for (const def of ASSESSMENT_TEMPLATES) {
    const templateId = [...templates.values()].find(
      (t) => t.key === def.key && t.version === def.version,
    )!.id;
    def.fields.forEach((field, index) => {
      const stored = fields.get(`${templateId}::${field.key}`);
      assert.equal(stored?.order, index, `${def.key}.${field.key}`);
    });
  }
});

test("(key, version) is the template identity: same key + new version is a new row", async () => {
  const { store, templates } = makeFakeStore();
  const v1: AssessmentTemplateDef = {
    key: "X",
    version: 1,
    name: "X v1",
    description: "d",
    fields: [{ key: "f", label: "F", fieldType: FieldType.SHORT_TEXT }],
  };
  const v2: AssessmentTemplateDef = { ...v1, version: 2, name: "X v2" };

  await syncTemplateRegistry(store, [v1]);
  await syncTemplateRegistry(store, [v1, v2]);

  assert.equal(templates.size, 2);
  assert.equal(templates.get("X@1")?.name, "X v1");
  assert.equal(templates.get("X@2")?.name, "X v2");
});

test("a same-key same-version re-sync updates the existing row in place", async () => {
  const { store, templates } = makeFakeStore();
  const v1: AssessmentTemplateDef = {
    key: "X",
    version: 1,
    name: "X v1",
    description: "d",
    fields: [{ key: "f", label: "F", fieldType: FieldType.SHORT_TEXT }],
  };

  await syncTemplateRegistry(store, [v1]);
  const originalId = templates.get("X@1")!.id;
  await syncTemplateRegistry(store, [{ ...v1, name: "renamed" }]);

  assert.equal(templates.size, 1);
  assert.equal(templates.get("X@1")?.id, originalId);
  assert.equal(templates.get("X@1")?.name, "renamed");
});

test("an invalid registry aborts the sync before any write", async () => {
  const { store, templates, calls } = makeFakeStore();
  const bad: AssessmentTemplateDef = {
    key: "BAD",
    version: 1,
    name: "Bad",
    description: "d",
    fields: [
      {
        key: "f",
        label: "F",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["a"],
        concerningValues: ["not-an-option"],
      },
    ],
  };

  await assert.rejects(() => syncTemplateRegistry(store, [bad]), /invalid/i);
  assert.equal(templates.size, 0);
  assert.equal(calls.upsertTemplate, 0);
});

test("a field's proposesCharacteristic name is resolved to an id and stored", async () => {
  const { store, templates, fields } = makeFakeStore();
  const def: AssessmentTemplateDef = {
    key: "P",
    version: 1,
    name: "P",
    description: "d",
    fields: [
      {
        key: "rec",
        label: "Recommendation",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Yes", "No"],
        concerningValues: ["No"],
        proposesCharacteristic: "Good with cats",
        proposesOnValues: ["Yes"],
      },
    ],
  };

  await syncTemplateRegistry(store, [def]);
  const templateId = [...templates.values()][0].id;
  const stored = fields.get(`${templateId}::rec`);
  assert.equal(stored?.proposesCharacteristicId, "char_Good_with_cats");
  assert.deepEqual(stored?.proposesOnValues, ["Yes"]);
});

test("a proposesCharacteristic naming an unknown trait aborts the sync", async () => {
  const { store } = makeFakeStore({ knownCharacteristics: [] });
  const def: AssessmentTemplateDef = {
    key: "P",
    version: 1,
    name: "P",
    description: "d",
    fields: [
      {
        key: "rec",
        label: "Recommendation",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Yes", "No"],
        proposesCharacteristic: "Nonexistent Trait",
        proposesOnValues: ["Yes"],
      },
    ],
  };

  await assert.rejects(
    () => syncTemplateRegistry(store, [def]),
    /not in the catalog/i,
  );
});

test("a field row keeps the trait it proposes when the catalog name changes", async () => {
  const def: AssessmentTemplateDef = {
    key: "P",
    version: 1,
    name: "P",
    description: "d",
    fields: [
      {
        key: "rec",
        label: "Recommendation",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Yes", "No"],
        proposesCharacteristic: "Good with cats",
        proposesOnValues: ["Yes"],
      },
    ],
  };
  const known = ["Good with cats"];
  const { store, templates, fields } = makeFakeStore({
    knownCharacteristics: known,
  });
  await syncTemplateRegistry(store, [def]);

  // Renamed in Settings: the registry's name no longer resolves.
  known.length = 0;
  await syncTemplateRegistry(store, [def]);

  const templateId = [...templates.values()][0].id;
  assert.equal(
    fields.get(`${templateId}::rec`)?.proposesCharacteristicId,
    "char_Good_with_cats",
  );
});
