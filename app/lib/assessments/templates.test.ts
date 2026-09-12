// Pure registry-integrity tests. No database: runs under `npm test`
// (`tsx --test "app/**/*.test.ts"`, no dotenv prefix), so it must not import
// anything that opens a connection. `templates.ts` only pulls in the generated
// `FieldType` enum (a plain object at runtime), so importing it here is safe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FieldType } from "@/prisma/generated/enums";
import {
  ASSESSMENT_TEMPLATES,
  getActiveTemplate,
  validateRegistry,
  type AssessmentTemplateDef,
} from "./templates";

const EXPECTED_KEYS = [
  "INTAKE_MEDICAL",
  "INTAKE_BEHAVIORAL",
  "CAT_TEST",
  "DOG_INTRO",
  "HANDLING",
  "DAILY_ROUNDS",
];

test("the shipped registry is well-formed", () => {
  assert.deepEqual(validateRegistry(), []);
});

test("the registry contains exactly the templates the seed and later steps expect", () => {
  const keys = ASSESSMENT_TEMPLATES.map((t) => t.key).sort();
  assert.deepEqual(keys, [...EXPECTED_KEYS].sort());
});

test("(key, version) is unique across the registry", () => {
  const seen = new Set<string>();
  for (const t of ASSESSMENT_TEMPLATES) {
    const kv = `${t.key}@${t.version}`;
    assert.ok(!seen.has(kv), `duplicate ${kv}`);
    seen.add(kv);
  }
});

test("every concerningValue is one of its field's options", () => {
  for (const template of ASSESSMENT_TEMPLATES) {
    for (const field of template.fields) {
      for (const value of field.concerningValues ?? []) {
        assert.ok(
          (field.options ?? []).includes(value),
          `${template.key}.${field.key}: "${value}" not in options`,
        );
      }
    }
  }
});

test("only select fields carry options", () => {
  for (const template of ASSESSMENT_TEMPLATES) {
    for (const field of template.fields) {
      const isSelect =
        field.fieldType === FieldType.SINGLE_SELECT ||
        field.fieldType === FieldType.MULTI_SELECT;
      if (!isSelect) {
        assert.equal(
          field.options ?? undefined,
          undefined,
          `${template.key}.${field.key} is ${field.fieldType} but has options`,
        );
      }
    }
  }
});

test("CAT_TEST can source a 'Not cat-safe' concern — the finding Step 5 keys off", () => {
  const catTest = getActiveTemplate("CAT_TEST");
  assert.ok(catTest);
  const rec = catTest.fields.find((f) => f.key === "recommendation");
  assert.ok(rec?.concerningValues?.includes("Not cat-safe"));
});

// --- validateRegistry catches the mistakes a future editor could make --------

const base: AssessmentTemplateDef = {
  key: "T",
  version: 1,
  name: "T",
  description: "d",
  fields: [
    {
      key: "f",
      label: "F",
      fieldType: FieldType.SINGLE_SELECT,
      options: ["a", "b"],
      concerningValues: ["b"],
    },
  ],
};

test("validateRegistry flags a duplicate (key, version)", () => {
  const errors = validateRegistry([base, { ...base, name: "T2" }]);
  assert.ok(errors.some((e) => e.includes("duplicate template")));
});

test("validateRegistry flags a concerningValue that is not an option", () => {
  const errors = validateRegistry([
    {
      ...base,
      fields: [{ ...base.fields[0], concerningValues: ["z"] }],
    },
  ]);
  assert.ok(errors.some((e) => e.includes('concerningValue "z"')));
});

test("validateRegistry flags options on a non-select field", () => {
  const errors = validateRegistry([
    {
      ...base,
      fields: [
        {
          key: "n",
          label: "N",
          fieldType: FieldType.NUMBER,
          options: ["1", "2"],
        },
      ],
    },
  ]);
  assert.ok(errors.some((e) => e.includes("must not declare options")));
});

test("validateRegistry flags a duplicate field key within a template", () => {
  const errors = validateRegistry([
    {
      ...base,
      fields: [base.fields[0], { ...base.fields[0], label: "again" }],
    },
  ]);
  assert.ok(errors.some((e) => e.includes("duplicate field key")));
});

test("validateRegistry flags proposesOnValues without a proposesCharacteristic", () => {
  const errors = validateRegistry([
    { ...base, fields: [{ ...base.fields[0], proposesOnValues: ["a"] }] },
  ]);
  assert.ok(errors.some((e) => e.includes("without a proposesCharacteristic")));
});

test("validateRegistry flags a proposesCharacteristic with no proposesOnValues", () => {
  const errors = validateRegistry([
    {
      ...base,
      fields: [{ ...base.fields[0], proposesCharacteristic: "Good with cats" }],
    },
  ]);
  assert.ok(errors.some((e) => e.includes("proposesOnValues is empty")));
});

test("validateRegistry flags a proposesOnValue that is not an option", () => {
  const errors = validateRegistry([
    {
      ...base,
      fields: [
        {
          ...base.fields[0],
          proposesCharacteristic: "Good with cats",
          proposesOnValues: ["z"],
        },
      ],
    },
  ]);
  assert.ok(errors.some((e) => e.includes('proposesOnValue "z"')));
});

test("validateRegistry flags a multi-select field that proposes a trait", () => {
  const errors = validateRegistry([
    {
      ...base,
      fields: [
        {
          ...base.fields[0],
          fieldType: FieldType.MULTI_SELECT,
          proposesCharacteristic: "Good with cats",
          proposesOnValues: ["a"],
        },
      ],
    },
  ]);
  assert.ok(
    errors.some((e) =>
      e.includes("only SINGLE_SELECT fields can propose a characteristic"),
    ),
  );
});

test("validateRegistry flags two fields of one template proposing the same trait", () => {
  const proposer = {
    ...base.fields[0],
    proposesCharacteristic: "Good with cats",
    proposesOnValues: ["a"],
  };
  const errors = validateRegistry([
    { ...base, fields: [proposer, { ...proposer, key: "g", label: "G" }] },
  ]);
  assert.ok(
    errors.some((e) =>
      e.includes(
        'field "g": proposes "Good with cats", which field "f" already proposes',
      ),
    ),
  );
  // Different templates proposing the same trait is the normal case.
  assert.deepEqual(
    validateRegistry([
      { ...base, fields: [proposer] },
      { ...base, key: "U", fields: [proposer] },
    ]),
    [],
  );
});

test("validateRegistry flags a value that both affirms and contradicts a trait", () => {
  const errors = validateRegistry([
    {
      ...base,
      fields: [
        {
          ...base.fields[0],
          concerningValues: ["b"],
          proposesCharacteristic: "Good with cats",
          proposesOnValues: ["b"],
        },
      ],
    },
  ]);
  assert.ok(errors.some((e) => e.includes("both affirm and contradict")));
});

test("CAT_TEST and DOG_INTRO recommendations propose the expected traits", () => {
  const cat = getActiveTemplate("CAT_TEST")!.fields.find(
    (f) => f.key === "recommendation",
  );
  assert.equal(cat?.proposesCharacteristic, "Good with cats");
  assert.deepEqual(cat?.proposesOnValues, ["Cat-safe"]);

  const dog = getActiveTemplate("DOG_INTRO")!.fields.find(
    (f) => f.key === "recommendation",
  );
  assert.equal(dog?.proposesCharacteristic, "Good with other dogs");
  assert.deepEqual(dog?.proposesOnValues, ["Dog-social"]);
});

test("getActiveTemplate returns the highest active version for a key", () => {
  const v1 = { ...base, version: 1 };
  const v2 = { ...base, version: 2, name: "T v2" };
  assert.equal(getActiveTemplate("T", [v1, v2])?.version, 2);
  assert.equal(
    getActiveTemplate("T", [v1, { ...v2, isActive: false }])?.version,
    1,
  );
  assert.equal(getActiveTemplate("missing", [v1])?.version, undefined);
});
