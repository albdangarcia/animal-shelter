import { test } from "node:test";
import assert from "node:assert/strict";
import { describePlacementEnd } from "./foster-placement-end-label";
import { FosterReturnReason, OutcomeType } from "@/prisma/generated/enums";

const REVERSED_AT = new Date("2026-09-20T15:00:00Z");

test("describePlacementEnd: a placement an outcome ended reads as that outcome", () => {
  assert.equal(
    describePlacementEnd({
      returnReason: FosterReturnReason.ENDED_BY_OUTCOME,
      outcome: { type: OutcomeType.DECEASED, reversedAt: null },
    }),
    "Ended: deceased",
  );
  // A type of more than one word reads as words, not as the enum.
  assert.equal(
    describePlacementEnd({
      returnReason: FosterReturnReason.ENDED_BY_OUTCOME,
      outcome: { type: OutcomeType.TRANSFER_OUT, reversedAt: null },
    }),
    "Ended: transfer out",
  );
});

test("describePlacementEnd: an outcome reversed after the placement ended is marked reversed", () => {
  assert.equal(
    describePlacementEnd({
      returnReason: FosterReturnReason.ENDED_BY_OUTCOME,
      outcome: { type: OutcomeType.OTHER, reversedAt: REVERSED_AT },
    }),
    "Ended: other (reversed)",
  );
  assert.equal(
    describePlacementEnd({
      returnReason: FosterReturnReason.ENDED_BY_OUTCOME,
      outcome: { type: OutcomeType.DECEASED, reversedAt: REVERSED_AT },
    }),
    "Ended: deceased (reversed)",
  );
  assert.equal(
    describePlacementEnd({
      returnReason: FosterReturnReason.ENDED_BY_OUTCOME,
      outcome: { type: OutcomeType.TRANSFER_OUT, reversedAt: REVERSED_AT },
    }),
    "Ended: transfer out (reversed)",
  );
});

test("describePlacementEnd: a plain return reads as its reason", () => {
  assert.equal(
    describePlacementEnd({
      returnReason: FosterReturnReason.RETURNED_TO_SHELTER,
      outcome: null,
    }),
    "Returned To Shelter",
  );
  // The foster adopting is linked to its adoption outcome too, but its reason
  // already says how it ended.
  assert.equal(
    describePlacementEnd({
      returnReason: FosterReturnReason.ADOPTED_BY_FOSTER,
      outcome: { type: OutcomeType.ADOPTION, reversedAt: null },
    }),
    "Adopted By Foster",
  );
  // A placement a reversal reopened keeps its link to the reversed outcome,
  // and a later return to the shelter leaves it. That return is not reversed.
  assert.equal(
    describePlacementEnd({
      returnReason: FosterReturnReason.RETURNED_TO_SHELTER,
      outcome: { type: OutcomeType.DECEASED, reversedAt: REVERSED_AT },
    }),
    "Returned To Shelter",
  );
});

test("describePlacementEnd: an outcome-ended placement whose outcome is gone reads as its reason", () => {
  assert.equal(
    describePlacementEnd({
      returnReason: FosterReturnReason.ENDED_BY_OUTCOME,
      outcome: null,
    }),
    "Ended By Outcome",
  );
});
