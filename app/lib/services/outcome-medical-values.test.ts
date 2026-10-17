import { test } from "node:test";
import assert from "node:assert/strict";
import { OutcomeMedicalDetailsSchema } from "@/app/lib/zod-schemas/outcome-medical.schemas";
import { outcomeMedicalValues } from "./outcome-medical-values";

test("euthanasia values preserve the recorded people and descriptive dose without a duplicate giver", () => {
  const person = "cmvc07m5h0094dtulmaxfa9gc";
  const details = OutcomeMedicalDetailsSchema.parse({
    kind: "EUTHANASIA",
    source: "OUTSIDE_VET",
    reasonCategory: "OTHER",
    reasonNotes: " Recorded reason ",
    authorizedById: person,
    performedByName: " Dr Example ",
    drug: " Recorded agent ",
    dose: " Recorded amount and unit ",
    route: " Route as documented ",
    witness: " Recorded witness ",
    bodyDisposition: " Pending ",
  });
  const values = outcomeMedicalValues(details);
  assert.deepEqual(values, { ...details, administeredById: null });
  assert.equal(values.kind, "EUTHANASIA");
  if (values.kind !== "EUTHANASIA") throw new Error("Expected euthanasia");
  assert.equal(values.authorizedById, person);
  assert.equal(values.performedById, null);
  assert.equal(values.performedByName, "Dr Example");
  assert.equal(values.dose, "Recorded amount and unit");
});

test("death values contain no invented care source or actor and omit the form's cause choice", () => {
  const details = OutcomeMedicalDetailsSchema.parse({
    kind: "DEATH",
    circumstances: "DURING_PROCEDURE",
    causeKnowledge: "UNKNOWN",
    cause: "Stale cause",
    necropsyRequested: null,
  });
  assert.deepEqual(outcomeMedicalValues(details), {
    kind: "DEATH",
    source: null,
    vetPartnerId: null,
    vetName: null,
    administeredById: null,
    circumstances: "DURING_PROCEDURE",
    circumstanceNotes: null,
    cause: null,
    necropsyRequested: null,
    bodyDisposition: null,
  });
});

test("supplying full corrected details clears optional values without mutating the original payload", () => {
  const details = OutcomeMedicalDetailsSchema.parse({
    kind: "DEATH",
    circumstances: "OTHER",
    circumstanceNotes: " Recorded circumstances ",
    causeKnowledge: "KNOWN",
    cause: " Recorded cause ",
    necropsyRequested: false,
    bodyDisposition: " ",
  });
  const before = structuredClone(details);
  const values = outcomeMedicalValues(details);
  assert.equal(values.kind, "DEATH");
  if (values.kind !== "DEATH") throw new Error("Expected death");
  assert.equal(values.cause, "Recorded cause");
  assert.equal(values.bodyDisposition, null);
  assert.equal(values.necropsyRequested, false);
  assert.deepEqual(details, before);
});
