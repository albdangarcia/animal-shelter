import { test } from "node:test";
import assert from "node:assert/strict";
import { AssessmentSignal } from "@/prisma/generated/enums";
import { deriveSignal, maxSignal, formatSignal } from "./signal";

test("maxSignal returns the more urgent of two signals", () => {
  assert.equal(
    maxSignal(AssessmentSignal.NO_CONCERNS, AssessmentSignal.FOLLOW_UP),
    AssessmentSignal.FOLLOW_UP,
  );
  assert.equal(
    maxSignal(AssessmentSignal.ESCALATE, AssessmentSignal.MONITOR),
    AssessmentSignal.ESCALATE,
  );
  assert.equal(
    maxSignal(AssessmentSignal.MONITOR, AssessmentSignal.MONITOR),
    AssessmentSignal.MONITOR,
  );
});

test("deriveSignal floors a concerning observation at MONITOR", () => {
  assert.equal(
    deriveSignal(AssessmentSignal.NO_CONCERNS, 1),
    AssessmentSignal.MONITOR,
  );
  assert.equal(
    deriveSignal(AssessmentSignal.NO_CONCERNS, 3),
    AssessmentSignal.MONITOR,
  );
});

test("deriveSignal leaves a clean observation untouched", () => {
  assert.equal(
    deriveSignal(AssessmentSignal.NO_CONCERNS, 0),
    AssessmentSignal.NO_CONCERNS,
  );
});

test("deriveSignal never lowers a reviewer's more urgent judgement", () => {
  assert.equal(
    deriveSignal(AssessmentSignal.ESCALATE, 0),
    AssessmentSignal.ESCALATE,
  );
  assert.equal(
    deriveSignal(AssessmentSignal.FOLLOW_UP, 2),
    AssessmentSignal.FOLLOW_UP,
  );
});

test("formatSignal is human-readable", () => {
  assert.equal(formatSignal(AssessmentSignal.NO_CONCERNS), "No concerns");
  assert.equal(formatSignal(AssessmentSignal.FOLLOW_UP), "Follow up");
});
