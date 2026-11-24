import { test } from "node:test";
import assert from "node:assert/strict";
import { OutcomeType } from "@/prisma/generated/enums";
import {
  describeOutcomeType,
  formatOutcomeType,
  isLiveOutcome,
  LIVE_OUTCOME_TYPES,
  OUTCOME_TYPE_HELP,
  OUTCOME_TYPE_REPORT_ORDER,
} from "./outcome-types";
import { outcomeTypeOptions } from "./enum-formatter";

test("return to field and other live outcome are live; lost in care is not", () => {
  assert.equal(isLiveOutcome(OutcomeType.RETURN_TO_FIELD), true);
  assert.equal(isLiveOutcome(OutcomeType.OTHER), true);
  assert.equal(isLiveOutcome(OutcomeType.LOST_IN_CARE), false);
});

test("the live outcomes are the Shelter Animals Count ones, and only those", () => {
  assert.deepEqual(
    Object.values(OutcomeType).filter(isLiveOutcome),
    [
      OutcomeType.ADOPTION,
      OutcomeType.TRANSFER_OUT,
      OutcomeType.RETURN_TO_OWNER,
      OutcomeType.OTHER,
      OutcomeType.RETURN_TO_FIELD,
    ],
  );
  assert.deepEqual(
    Object.values(OutcomeType).filter((type) => !isLiveOutcome(type)),
    [OutcomeType.DECEASED, OutcomeType.EUTHANIZED, OutcomeType.LOST_IN_CARE],
  );
});

test("the report lists every type once, live ones first", () => {
  assert.deepEqual(
    [...OUTCOME_TYPE_REPORT_ORDER].sort(),
    Object.values(OutcomeType).sort(),
  );
  const firstNonLive = OUTCOME_TYPE_REPORT_ORDER.findIndex(
    (type) => !isLiveOutcome(type),
  );
  assert.deepEqual(
    OUTCOME_TYPE_REPORT_ORDER.slice(0, firstNonLive),
    LIVE_OUTCOME_TYPES,
  );
  assert.equal(
    OUTCOME_TYPE_REPORT_ORDER.slice(firstNonLive).some(isLiveOutcome),
    false,
  );
});

test("other reads as other live outcome, and the new types have their names", () => {
  assert.equal(formatOutcomeType(OutcomeType.OTHER), "Other Live Outcome");
  assert.equal(formatOutcomeType(OutcomeType.RETURN_TO_FIELD), "Return To Field");
  assert.equal(formatOutcomeType(OutcomeType.LOST_IN_CARE), "Lost In Care");
  assert.equal(formatOutcomeType(OutcomeType.RETURN_TO_OWNER), "Return To Owner");
});

test("the outcome form offers every type under its name", () => {
  assert.deepEqual(
    outcomeTypeOptions,
    Object.values(OutcomeType).map((value) => ({
      value,
      label: formatOutcomeType(value),
    })),
  );
});

test("the types easy to misread explain themselves under the picker", () => {
  assert.deepEqual(Object.keys(OUTCOME_TYPE_HELP).sort(), [
    OutcomeType.LOST_IN_CARE,
    OutcomeType.OTHER,
    OutcomeType.RETURN_TO_FIELD,
  ]);
  assert.match(OUTCOME_TYPE_HELP.OTHER!, /Lost In Care/);
  assert.match(OUTCOME_TYPE_HELP.RETURN_TO_FIELD!, /Not trap-neuter-return/);
});

test("history lines write a type as the form names it, in lower case", () => {
  assert.equal(describeOutcomeType(OutcomeType.OTHER), "other live outcome");
  assert.equal(describeOutcomeType(OutcomeType.LOST_IN_CARE), "lost in care");
  assert.equal(describeOutcomeType(OutcomeType.TRANSFER_OUT), "transfer out");
});
