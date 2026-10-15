import { test } from "node:test";
import assert from "node:assert/strict";
import { IntakeCorrectionFormSchema, ReIntakeFormSchema } from "./intake.schema";
import { IntakeType } from "@/prisma/generated/enums";

const reIntake = { intakeType: IntakeType.SEIZE, intakeDate: "2026-10-01" };

test("ReIntakeFormSchema: the medical protocol is applied unless it is left out", () => {
  assert.equal(ReIntakeFormSchema.parse(reIntake).applyProtocol, true);
  assert.equal(
    ReIntakeFormSchema.parse({ ...reIntake, applyProtocol: false }).applyProtocol,
    false,
  );
  // What the form parsed parses again unchanged, as the action parses it.
  const parsed = ReIntakeFormSchema.parse(reIntake);
  assert.deepEqual(ReIntakeFormSchema.parse(parsed), parsed);
});

test("IntakeCorrectionFormSchema: correcting an intake never applies a protocol", () => {
  assert.equal("applyProtocol" in IntakeCorrectionFormSchema.parse(reIntake), false);
});
