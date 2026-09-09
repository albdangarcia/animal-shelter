import { FieldType } from "@/prisma/generated/enums";

/**
 * The code-defined assessment template registry — the single source of truth
 * for what structured checks exist, mirrored into the `AssessmentTemplate` /
 * `AssessmentTemplateField` tables by the seed. Reviewable in git,
 * type-safe, and no half-built form builder.
 *
 * Rules a future editor must keep (enforced by `validateRegistry`, which the
 * seed's sync runs before writing and `templates.test.ts` runs in CI):
 *
 *  - `(key, version)` is unique. A real edit to a live template is a NEW entry
 *    with `version + 1`, never a mutation of the existing one — assessments
 *    point at the exact version they were recorded against.
 *  - within a template, field `key`s are unique and stable. Rename the `label`
 *    freely across versions; never reuse or repurpose a `key`.
 *  - `concerningValues` and the eventual proposal mappings may only reference
 *    strings that appear in that field's `options`.
 *  - only `SINGLE_SELECT` / `MULTI_SELECT` fields carry `options`.
 */

export interface AssessmentTemplateFieldDef {
  /** Stable identifier within the template. Answers match on this. */
  key: string;
  label: string;
  fieldType: FieldType;
  /** Required for the select types, forbidden for the others. */
  options?: string[];
  /** Subset of `options` that raises the assessment signal when selected. */
  concerningValues?: string[];
  isRequired?: boolean;
}

export interface AssessmentTemplateDef {
  /** Stable identifier shared across versions, e.g. "CAT_TEST". */
  key: string;
  version: number;
  name: string;
  description: string;
  /** `Species.name` this template is scoped to. Omit for all species. */
  species?: string;
  /** Free-text lifecycle-stage hint. Stage gating logic lives in Step 6. */
  stage?: string;
  /** Defaults to `true`. A retired template stays in the registry for history. */
  isActive?: boolean;
  fields: AssessmentTemplateFieldDef[];
}

const notes: AssessmentTemplateFieldDef = {
  key: "notes",
  label: "Notes",
  fieldType: FieldType.LONG_TEXT,
};

export const ASSESSMENT_TEMPLATES: AssessmentTemplateDef[] = [
  {
    key: "INTAKE_MEDICAL",
    version: 1,
    name: "Intake Medical",
    description:
      "First-pass physical check performed at or shortly after intake for every animal.",
    stage: "intake",
    fields: [
      {
        key: "body_condition",
        label: "Body condition",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Emaciated", "Thin", "Ideal", "Overweight", "Obese"],
        concerningValues: ["Emaciated", "Obese"],
        isRequired: true,
      },
      {
        key: "dental",
        label: "Dental",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Normal",
          "Mild tartar",
          "Moderate disease",
          "Severe disease",
        ],
        concerningValues: ["Severe disease"],
      },
      {
        key: "parasites",
        label: "External parasites",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["None seen", "Fleas", "Ticks", "Ear mites", "Treated"],
        concerningValues: ["Fleas", "Ticks", "Ear mites"],
      },
      {
        key: "heart_lungs",
        label: "Heart & lungs on auscultation",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Clear", "Murmur", "Increased respiratory effort"],
        concerningValues: ["Murmur", "Increased respiratory effort"],
      },
      {
        key: "intake_weight_grams",
        label: "Weight at intake (grams)",
        fieldType: FieldType.NUMBER,
        isRequired: true,
      },
      notes,
    ],
  },
  {
    key: "INTAKE_BEHAVIORAL",
    version: 1,
    name: "Intake Behavioral",
    description:
      "Baseline behavioral read taken in the first few days: kennel presence, handling, and resource behavior.",
    stage: "intake",
    fields: [
      {
        key: "kennel_presence",
        label: "Kennel presence",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Relaxed",
          "Alert",
          "Anxious",
          "Barrier reactive",
          "Shut down",
        ],
        concerningValues: ["Barrier reactive", "Shut down"],
        isRequired: true,
      },
      {
        key: "handler_sociability",
        label: "Sociability with handler",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Solicits attention", "Neutral", "Avoidant", "Fearful"],
        concerningValues: ["Fearful"],
      },
      {
        key: "food_guarding",
        label: "Food guarding (high-value item)",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["None", "Stiffens", "Growls", "Snaps"],
        concerningValues: ["Growls", "Snaps"],
      },
      {
        key: "body_handling",
        label: "Tolerance of body handling",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Tolerates all",
          "Tolerates most",
          "Pulls away",
          "Bites or attempts to",
        ],
        concerningValues: ["Bites or attempts to"],
      },
      {
        key: "arousal_recovery",
        label: "Recovery from arousal",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Quick", "Moderate", "Slow"],
        concerningValues: ["Slow"],
      },
      notes,
    ],
  },
  {
    key: "CAT_TEST",
    version: 1,
    name: "Cat Test",
    description:
      "Structured introduction of a dog to a calm cat behind a barrier, then at controlled proximity.",
    species: "Dog",
    stage: "adoption-prep",
    fields: [
      {
        key: "visual_response",
        label: "Response on first seeing the cat",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Ignores", "Curious and calm", "Fixated", "Lunges or barks"],
        concerningValues: ["Fixated", "Lunges or barks"],
        isRequired: true,
      },
      {
        key: "proximity_response",
        label: "Response at close proximity",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Calm",
          "Mild interest",
          "Overstimulated",
          "Predatory (stalk, hard stare, lunge)",
        ],
        concerningValues: [
          "Overstimulated",
          "Predatory (stalk, hard stare, lunge)",
        ],
        isRequired: true,
      },
      {
        key: "recovery",
        label: "Redirects away from the cat when asked",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Redirects easily",
          "Redirects with effort",
          "Cannot redirect",
        ],
        concerningValues: ["Cannot redirect"],
      },
      {
        key: "recommendation",
        label: "Recommendation",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Cat-safe",
          "Cat-tolerant with management",
          "Not cat-safe",
          "Inconclusive — retest",
        ],
        concerningValues: ["Not cat-safe"],
        isRequired: true,
      },
      notes,
    ],
  },
  {
    key: "DOG_INTRO",
    version: 1,
    name: "Dog-to-Dog Introduction",
    description:
      "Parallel walk and, if it goes well, an on-leash then off-leash greeting with a stable helper dog.",
    species: "Dog",
    stage: "adoption-prep",
    fields: [
      {
        key: "greeting_style",
        label: "Greeting style",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Loose and social",
          "Tense",
          "Avoidant",
          "Over-the-top but not aggressive",
        ],
        concerningValues: ["Tense"],
        isRequired: true,
      },
      {
        key: "play_style",
        label: "Play style",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Appropriate, takes breaks",
          "Rude but recovers",
          "Bullying",
          "No interest in play",
        ],
        concerningValues: ["Bullying"],
      },
      {
        key: "correction_response",
        label: "Response to a correction from the other dog",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Defers appropriately", "Freezes", "Escalates"],
        concerningValues: ["Escalates"],
      },
      {
        key: "resource_around_dogs",
        label: "Resource behavior around other dogs",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Neutral", "Guards from dogs", "Not tested"],
        concerningValues: ["Guards from dogs"],
      },
      {
        key: "recommendation",
        label: "Recommendation",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Dog-social",
          "Dog-selective",
          "Needs slow introductions",
          "Solo-dog home",
        ],
        concerningValues: ["Solo-dog home"],
        isRequired: true,
      },
      notes,
    ],
  },
  {
    key: "HANDLING",
    version: 1,
    name: "Handling Sensitivity",
    description:
      "How the animal tolerates the routine handling that daily shelter care and a vet visit require.",
    fields: [
      {
        key: "collar_leash",
        label: "Collar and leash application",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Accepts readily",
          "Accepts with time",
          "Resists",
          "Panics",
        ],
        concerningValues: ["Panics"],
        isRequired: true,
      },
      {
        key: "restraint",
        label: "Gentle restraint for exam",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Relaxed", "Tolerates", "Struggles", "Freezes or panics"],
        concerningValues: ["Freezes or panics"],
      },
      {
        key: "paws_nails",
        label: "Paw handling / nail trim",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "No concern",
          "Mild pull-away",
          "Strong pull-away",
          "Snaps",
        ],
        concerningValues: ["Snaps"],
      },
      {
        key: "ears_mouth",
        label: "Ear and mouth handling",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "No concern",
          "Mild avoidance",
          "Strong avoidance",
          "Snaps",
        ],
        concerningValues: ["Snaps"],
      },
      {
        key: "overall_sensitivity",
        label: "Overall handling sensitivity",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Low", "Moderate", "High"],
        concerningValues: ["High"],
        isRequired: true,
      },
      notes,
    ],
  },
  {
    key: "DAILY_ROUNDS",
    version: 1,
    name: "Daily Rounds",
    description:
      "The fast once-per-day kennel check — appetite, elimination, energy, and stress. Filled from the Rounds screen (Step 10).",
    stage: "in-care",
    fields: [
      {
        key: "appetite",
        label: "Appetite",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Normal", "Reduced", "Not eating"],
        concerningValues: ["Not eating"],
        isRequired: true,
      },
      {
        key: "stool",
        label: "Stool",
        fieldType: FieldType.SINGLE_SELECT,
        options: [
          "Normal",
          "Soft",
          "Diarrhea",
          "Blood present",
          "Not observed",
        ],
        concerningValues: ["Diarrhea", "Blood present"],
      },
      {
        key: "energy",
        label: "Energy",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Bright", "Quiet", "Lethargic"],
        concerningValues: ["Lethargic"],
        isRequired: true,
      },
      {
        key: "respiratory",
        label: "Respiratory",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Normal", "Sneezing", "Coughing", "Labored"],
        concerningValues: ["Coughing", "Labored"],
      },
      {
        key: "demeanor",
        label: "Demeanor",
        fieldType: FieldType.SINGLE_SELECT,
        options: ["Comfortable", "Mild stress", "High stress"],
        concerningValues: ["High stress"],
      },
      { key: "notes", label: "Notes", fieldType: FieldType.SHORT_TEXT },
    ],
  },
];

const SELECT_TYPES: FieldType[] = [
  FieldType.SINGLE_SELECT,
  FieldType.MULTI_SELECT,
];

/**
 * Pure structural check of a set of template defs. Returns a list of
 * human-readable problems; an empty list means the registry is well-formed.
 * Run by the seed's sync (fail fast before writing) and by the unit tests.
 */
export function validateRegistry(
  templates: readonly AssessmentTemplateDef[] = ASSESSMENT_TEMPLATES,
): string[] {
  const errors: string[] = [];
  const seenKeyVersions = new Set<string>();

  for (const template of templates) {
    const kv = `${template.key}@${template.version}`;
    if (seenKeyVersions.has(kv)) {
      errors.push(`duplicate template (key, version): ${kv}`);
    }
    seenKeyVersions.add(kv);

    if (template.version < 1 || !Number.isInteger(template.version)) {
      errors.push(`${kv}: version must be a positive integer`);
    }
    if (template.fields.length === 0) {
      errors.push(`${kv}: has no fields`);
    }

    const seenFieldKeys = new Set<string>();
    for (const field of template.fields) {
      const ref = `${kv} field "${field.key}"`;
      if (seenFieldKeys.has(field.key)) {
        errors.push(`${ref}: duplicate field key`);
      }
      seenFieldKeys.add(field.key);

      const isSelect = SELECT_TYPES.includes(field.fieldType);
      const options = field.options ?? [];

      if (isSelect && options.length === 0) {
        errors.push(`${ref}: ${field.fieldType} requires options`);
      }
      if (!isSelect && options.length > 0) {
        errors.push(`${ref}: ${field.fieldType} must not declare options`);
      }
      if (new Set(options).size !== options.length) {
        errors.push(`${ref}: options contains duplicates`);
      }

      for (const value of field.concerningValues ?? []) {
        if (!options.includes(value)) {
          errors.push(
            `${ref}: concerningValue "${value}" is not one of the field's options`,
          );
        }
      }
    }
  }

  return errors;
}

/** The active template for a key, at its highest version. */
export function getActiveTemplate(
  key: string,
  templates: readonly AssessmentTemplateDef[] = ASSESSMENT_TEMPLATES,
): AssessmentTemplateDef | undefined {
  return templates
    .filter((t) => t.key === key && t.isActive !== false)
    .sort((a, b) => b.version - a.version)[0];
}
