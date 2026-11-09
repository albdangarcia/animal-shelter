import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DeathMedicalSchema,
  EuthanasiaMedicalSchema,
  OutcomeMedicalCreateSchema,
  OutcomeMedicalCorrectionSchema,
} from "./outcome-medical.schemas";
import { MEDICAL_REASON_MAX_LENGTH, OUTCOME_MEDICAL_TEXT_MAX_LENGTH } from "@/app/lib/constants/medical";
import { fieldErrorsByPath } from "@/app/lib/utils/form-result-utils";

const person = "cmvc07m5h0094dtulmaxfa9gc";
const euthanasia = {
  kind: "EUTHANASIA",
  source: "IN_HOUSE",
  reasonCategory: "MEDICAL",
  authorizedById: person,
  performedById: person,
  drug: "Recorded agent",
  dose: "Recorded amount mL",
  route: "Recorded route",
} as const;
const death = {
  kind: "DEATH",
  circumstances: "FOUND_DEAD",
  causeKnowledge: "UNKNOWN",
  necropsyRequested: null,
} as const;

test("new end-of-life outcomes require complete medical facts, including when a client claims legacy", () => {
  for (const outcomeType of ["EUTHANIZED", "DECEASED"]) {
    assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType }).success, false);
    assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType, legacy: true }).success, false);
    assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType, medical: null }).success, false);
  }
  assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType: "EUTHANIZED", medical: euthanasia }).success, true);
  assert.equal(OutcomeMedicalCreateSchema.safeParse({ outcomeType: "DECEASED", medical: death }).success, true);
});

test("ordinary outcomes accept no medical payload, and mismatched kinds are refused", () => {
  for (const schema of [OutcomeMedicalCreateSchema, OutcomeMedicalCorrectionSchema]) {
    for (const outcomeType of ["ADOPTION", "TRANSFER_OUT", "RETURN_TO_OWNER", "OTHER"]) {
      assert.deepEqual(schema.parse({ outcomeType, ownerId: "hidden", destinationPartnerId: "hidden" }), { outcomeType });
      assert.equal(schema.safeParse({ outcomeType, medical: euthanasia }).success, false);
      assert.equal(schema.safeParse({ outcomeType, medical: death }).success, false);
    }
    assert.equal(schema.safeParse({ outcomeType: "EUTHANIZED", medical: death }).success, false);
    assert.equal(schema.safeParse({ outcomeType: "DECEASED", medical: euthanasia }).success, false);
  }
});

test("correction omission keeps the clinical record, whereas a supplied payload must be complete", () => {
  for (const outcomeType of ["EUTHANIZED", "DECEASED"]) {
    assert.deepEqual(OutcomeMedicalCorrectionSchema.parse({ outcomeType }), { outcomeType });
    assert.equal(OutcomeMedicalCorrectionSchema.safeParse({ outcomeType, medical: null }).success, false);
    assert.equal(OutcomeMedicalCorrectionSchema.safeParse({ outcomeType, medical: {} }).success, false);
  }
  assert.equal(OutcomeMedicalCorrectionSchema.safeParse({ outcomeType: "EUTHANIZED", medical: { ...euthanasia, drug: undefined } }).success, false);
  assert.equal(OutcomeMedicalCorrectionSchema.safeParse({ outcomeType: "DECEASED", medical: death }).success, true);
});

test("euthanasia trims its facts, clears optional blanks and permits the authorizer to be the performer", () => {
  const parsed = EuthanasiaMedicalSchema.parse({ ...euthanasia, authorizedById: ` ${person} `, performedById: ` ${person} `, drug: " Recorded agent ", dose: " Recorded amount mL ", route: " Recorded route ", reasonNotes: "  ", witness: "  ", bodyDisposition: "  " });
  assert.equal(parsed.authorizedById, person);
  assert.equal(parsed.performedById, person);
  assert.equal(parsed.drug, euthanasia.drug);
  assert.equal(parsed.dose, euthanasia.dose);
  assert.equal(parsed.route, euthanasia.route);
  for (const field of ["reasonNotes", "performedByName", "vetPartnerId", "vetName", "witness", "bodyDisposition"] as const) {
    assert.equal(parsed[field], null);
  }
  assert.deepEqual(EuthanasiaMedicalSchema.parse(parsed), parsed);
});

test("euthanasia requires each core fact, never defaulting an actor", () => {
  for (const field of ["reasonCategory", "authorizedById", "performedById", "drug", "dose", "route", "source"]) {
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, [field]: undefined }).success, false, field);
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, [field]: "   " }).success, false, field);
  }
  for (const field of ["authorizedById", "performedById", "vetPartnerId"]) {
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, [field]: "invalid ID" }).success, false, field);
  }
});

test("euthanasia requires exactly one performer and names alone are for outside care", () => {
  const outside = { ...euthanasia, source: "OUTSIDE_VET", performedById: "", performedByName: " Dr Example " };
  assert.equal(EuthanasiaMedicalSchema.parse(outside).performedByName, "Dr Example");
  assert.equal(EuthanasiaMedicalSchema.parse(outside).performedById, null);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...outside, performedById: person }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...outside, performedByName: "  " }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...outside, source: "IN_HOUSE" }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, source: "OUTSIDE_VET" }).success, true);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, performedById: null, source: "OUTSIDE_VET", vetPartnerId: person }).success, false);
});

test("an invalid performer choice marks both alternatives so the active control can show its error", () => {
  for (const performer of [
    { performedById: null, performedByName: "   " },
    { performedById: person, performedByName: "Dr Example" },
  ]) {
    const result = EuthanasiaMedicalSchema.safeParse({ ...euthanasia, source: "OUTSIDE_VET", ...performer });
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.deepEqual(result.error.issues.map((issue) => issue.path), [["performedById"], ["performedByName"]]);
    assert.equal(result.error.issues[0].message, result.error.issues[1].message);
  }
});

// What the outcome form submits when nothing has been filled in, plus the
// blank values a picker or select holds after being cleared. Every message
// for a field is kept, so a second message on the same field would show up.
const messagesFor = (schema: typeof EuthanasiaMedicalSchema | typeof DeathMedicalSchema, input: unknown) => {
  const result = schema.safeParse(input);
  assert.equal(result.success, false);
  if (result.success) throw new Error("Expected validation errors");
  const byField: Record<string, string[]> = {};
  for (const issue of result.error.issues) (byField[issue.path.join(".")] ??= []).push(issue.message);
  return byField;
};
const blankEuthanasia = { kind: "EUTHANASIA", source: "IN_HOUSE", authorizedById: "", performedById: "", drug: "", dose: "", route: "" };
const blankDeath = { kind: "DEATH", necropsyRequested: null };

const noDefaultWording = (messages: Record<string, string[]>) => {
  for (const list of Object.values(messages)) for (const message of list) assert.doesNotMatch(message, /Invalid|expected|CUID|"/);
};

test("an empty euthanasia form says what to pick, with no default validation wording", () => {
  const messages = messagesFor(EuthanasiaMedicalSchema, blankEuthanasia);
  // The performer rule is a refinement, which Zod skips while a field has the
  // wrong type; the missing reason category (undefined) is that error here.
  assert.deepEqual(messages, {
    reasonCategory: ["Pick a reason category."],
    authorizedById: ["Pick who authorized it."],
    drug: ["The drug is required."],
    dose: ["The dose with its unit is required."],
    route: ["The route is required."],
  });
  noDefaultWording(messages);
});

test("with a reason category picked, an empty euthanasia form also asks for the performer", () => {
  const messages = messagesFor(EuthanasiaMedicalSchema, { ...blankEuthanasia, reasonCategory: "MEDICAL" });
  assert.deepEqual(messages.performedById, ["Pick who performed the procedure."]);
  assert.deepEqual(messages.performedByName, ["Pick who performed the procedure."]);
  noDefaultWording(messages);
});

test("an empty death form says what to pick, with no default validation wording", () => {
  const messages = messagesFor(DeathMedicalSchema, blankDeath);
  assert.deepEqual(messages, {
    circumstances: ["Pick the circumstances."],
    causeKnowledge: ["Say whether the cause is known."],
  });
  noDefaultWording(messages);
});

test("a missing reason category asks for one, whether unset or cleared", () => {
  for (const reasonCategory of [undefined, "", null]) {
    assert.deepEqual(messagesFor(EuthanasiaMedicalSchema, { ...euthanasia, reasonCategory }).reasonCategory, ["Pick a reason category."]);
  }
});

test("a missing authorizer asks for one, whether unset, cleared or malformed", () => {
  for (const authorizedById of [undefined, "", "   ", "invalid ID"]) {
    assert.deepEqual(messagesFor(EuthanasiaMedicalSchema, { ...euthanasia, authorizedById }).authorizedById, ["Pick who authorized it."]);
  }
});

test("a malformed performer id asks for a valid performer", () => {
  assert.deepEqual(messagesFor(EuthanasiaMedicalSchema, { ...euthanasia, performedById: "invalid ID" }).performedById, ["Pick a valid performer."]);
});

test("a malformed clinic id asks for a clinic from the list, and a blank one clears", () => {
  assert.deepEqual(messagesFor(EuthanasiaMedicalSchema, { ...euthanasia, source: "OUTSIDE_VET", vetPartnerId: "invalid ID" }).vetPartnerId, ["Pick a clinic from the list."]);
  for (const vetPartnerId of ["", "  ", null, undefined]) {
    assert.equal(EuthanasiaMedicalSchema.parse({ ...euthanasia, source: "OUTSIDE_VET", vetPartnerId }).vetPartnerId, null);
  }
});

test("a missing source asks for one", () => {
  for (const source of [undefined, ""]) {
    assert.deepEqual(messagesFor(EuthanasiaMedicalSchema, { ...euthanasia, source }).source, ["Pick where the procedure was done."]);
  }
});

test("missing death circumstances ask for a pick, whether unset or cleared", () => {
  for (const circumstances of [undefined, ""]) {
    assert.deepEqual(messagesFor(DeathMedicalSchema, { ...death, circumstances }).circumstances, ["Pick the circumstances."]);
  }
});

test("a missing cause choice asks for an answer, whether unset or cleared", () => {
  for (const causeKnowledge of [undefined, ""]) {
    assert.deepEqual(messagesFor(DeathMedicalSchema, { ...death, causeKnowledge }).causeKnowledge, ["Say whether the cause is known."]);
  }
});

test("a missing necropsy answer asks for one", () => {
  assert.deepEqual(messagesFor(DeathMedicalSchema, { ...death, necropsyRequested: undefined }).necropsyRequested, ["Say whether a necropsy was requested."]);
});

test("an in-house procedure with no performer asks who performed it, on both alternatives", () => {
  const messages = messagesFor(EuthanasiaMedicalSchema, { ...euthanasia, performedById: "" });
  assert.deepEqual(messages, { performedById: ["Pick who performed the procedure."], performedByName: ["Pick who performed the procedure."] });
});

test("an outside procedure with no performer asks for a performer or the vet's name, on both alternatives", () => {
  const message = "Pick a performer or give the outside vet's name.";
  for (const performer of [{ performedById: "" }, { performedById: null, performedByName: "   " }]) {
    const messages = messagesFor(EuthanasiaMedicalSchema, { ...euthanasia, source: "OUTSIDE_VET", ...performer });
    assert.deepEqual(messages, { performedById: [message], performedByName: [message] });
  }
});

test("an outside procedure with a performer and a vet's name is told to give only one, on both alternatives", () => {
  const message = "Pick a performer or give the outside vet's name, not both.";
  const messages = messagesFor(EuthanasiaMedicalSchema, { ...euthanasia, source: "OUTSIDE_VET", performedByName: "Dr Example" });
  assert.deepEqual(messages, { performedById: [message], performedByName: [message] });
});

test("euthanasia source excludes before-intake and in-house care excludes clinic or vet fields", () => {
  for (const source of ["BEFORE_INTAKE", null, ""]) {
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, source }).success, false);
  }
  for (const fields of [{ vetPartnerId: person }, { vetName: "Dr Example" }]) {
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, ...fields }).success, false);
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, source: "OUTSIDE_VET", ...fields }).success, true);
  }
});

test("Other reasons and circumstances require their own explanatory notes", () => {
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, reasonCategory: "OTHER", reasonNotes: "  " }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, reasonCategory: "OTHER", reasonNotes: " Recorded reason " }).success, true);
  assert.equal(DeathMedicalSchema.safeParse({ ...death, circumstances: "OTHER", circumstanceNotes: "  " }).success, false);
  assert.equal(DeathMedicalSchema.safeParse({ ...death, circumstances: "OTHER", circumstanceNotes: " Recorded circumstances " }).success, true);
});

test("short descriptive fields accept the limit after trimming and refuse an overlong value", () => {
  for (const field of ["drug", "dose", "route", "witness", "bodyDisposition", "vetName", "performedByName"]) {
    const base = { ...euthanasia, source: "OUTSIDE_VET", ...(field === "performedByName" ? { performedById: null } : {}) };
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...base, [field]: ` ${"x".repeat(OUTCOME_MEDICAL_TEXT_MAX_LENGTH)} ` }).success, true, field);
    assert.equal(EuthanasiaMedicalSchema.safeParse({ ...base, [field]: "x".repeat(OUTCOME_MEDICAL_TEXT_MAX_LENGTH + 1) }).success, false, field);
  }
  assert.equal(DeathMedicalSchema.safeParse({ ...death, bodyDisposition: "x".repeat(200) }).success, true);
  assert.equal(DeathMedicalSchema.safeParse({ ...death, bodyDisposition: "x".repeat(201) }).success, false);
});

test("clinical prose uses the reason length limit", () => {
  for (const [schema, base, field] of [
    [EuthanasiaMedicalSchema, euthanasia, "reasonNotes"],
    [DeathMedicalSchema, death, "circumstanceNotes"],
    [DeathMedicalSchema, { ...death, causeKnowledge: "KNOWN" }, "cause"],
  ] as const) {
    assert.equal(schema.safeParse({ ...base, [field]: ` ${"x".repeat(MEDICAL_REASON_MAX_LENGTH)} ` }).success, true, field);
    assert.equal(schema.safeParse({ ...base, [field]: "x".repeat(MEDICAL_REASON_MAX_LENGTH + 1) }).success, false, field);
  }
});

test("death requires an explicit known-or-unknown choice, and a known cause needs text", () => {
  for (const causeKnowledge of [undefined, null, "", "MAYBE"]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, causeKnowledge }).success, false);
  }
  for (const cause of [undefined, null, "  "]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, causeKnowledge: "KNOWN", cause }).success, false);
  }
  assert.equal(DeathMedicalSchema.parse({ ...death, causeKnowledge: "KNOWN", cause: " Recorded cause " }).cause, "Recorded cause");
});

test("Unknown clears stale cause text and preserves unknown necropsy rather than inventing No", () => {
  const parsed = DeathMedicalSchema.parse({ ...death, cause: "Previously typed cause", bodyDisposition: " " });
  assert.equal(parsed.cause, null);
  assert.equal(parsed.necropsyRequested, null);
  assert.equal(parsed.bodyDisposition, null);
  assert.equal(parsed.source, null);
  assert.deepEqual(DeathMedicalSchema.parse(parsed), parsed);
  for (const necropsyRequested of [true, false, null]) {
    assert.equal(DeathMedicalSchema.parse({ ...death, necropsyRequested }).necropsyRequested, necropsyRequested);
  }
  for (const necropsyRequested of [undefined, "false", "", 0]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, necropsyRequested }).success, false);
  }
  assert.equal(DeathMedicalSchema.parse({ ...death, bodyDisposition: " Pending " }).bodyDisposition, "Pending");
});

test("clinical payloads refuse unrelated fields, fake care attribution and unsupported enum values", () => {
  for (const field of ["drug", "performedById", "administeredById", "vetPartnerId", "dueDate", "notes"]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, [field]: person }).success, false, field);
  }
  for (const source of ["IN_HOUSE", "OUTSIDE_VET", "BEFORE_INTAKE"]) {
    assert.equal(DeathMedicalSchema.safeParse({ ...death, source }).success, false);
  }
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, circumstances: "FOUND_DEAD" }).success, false);
  assert.equal(EuthanasiaMedicalSchema.safeParse({ ...euthanasia, reasonCategory: "UNKNOWN" }).success, false);
  assert.equal(DeathMedicalSchema.safeParse({ ...death, circumstances: "UNKNOWN" }).success, false);
});

test("nested errors retain dotted form paths for applyFieldErrors", () => {
  const parsed = OutcomeMedicalCreateSchema.safeParse({ outcomeType: "EUTHANIZED", medical: { ...euthanasia, reasonCategory: "OTHER", drug: " " } });
  assert.equal(parsed.success, false);
  if (parsed.success) throw new Error("Expected validation errors");
  const errors = fieldErrorsByPath<Record<string, unknown>>(parsed.error.issues);
  assert.ok(errors["medical.drug"]);
  assert.ok(errors["medical.reasonNotes"]);
});
