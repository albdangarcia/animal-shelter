import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MedicalEntryStatus,
  SpayNeuterExemptionReason,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import { calendarDay } from "./shelter-day";
import {
  openExemptionReview,
  spayNeuterStatus,
  type SpayNeuterEntry,
} from "./spay-neuter";

const TODAY = calendarDay("2026-10-12");

let written = 0;
// Each entry is written a minute after the one before, unless told when.
const entry = (overrides: Partial<SpayNeuterEntry>): SpayNeuterEntry => {
  written += 1;
  return {
    id: `entry-${written}`,
    status: MedicalEntryStatus.COMPLETED,
    procedure: SurgeryProcedure.SPAY,
    completedDate: null,
    exemptionReason: null,
    declineReason: null,
    reviewDate: null,
    updatedAt: new Date(Date.UTC(2026, 9, 1, 0, written)),
    ...overrides,
  };
};

const exemption = (reviewDate: string | null, overrides: Partial<SpayNeuterEntry> = {}) =>
  entry({
    status: MedicalEntryStatus.DECLINED,
    exemptionReason: SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT,
    reviewDate,
    ...overrides,
  });

const scheduled = () => entry({ status: MedicalEntryStatus.SCHEDULED });

test("nothing on record is Unknown", () => {
  assert.deepEqual(spayNeuterStatus([], TODAY), { status: "UNKNOWN", lapsedOn: null });
});

test("a spay or neuter given is Altered, and beats an exemption in force", () => {
  const given = entry({ procedure: SurgeryProcedure.NEUTER, completedDate: "2026-09-03" });
  assert.deepEqual(spayNeuterStatus([exemption(null), given], TODAY), {
    status: "ALTERED",
    entryId: given.id,
    procedure: SurgeryProcedure.NEUTER,
    completedDate: "2026-09-03",
  });
  // Before intake, on a day nobody knows.
  const found = entry({});
  assert.deepEqual(spayNeuterStatus([found], TODAY), {
    status: "ALTERED",
    entryId: found.id,
    procedure: SurgeryProcedure.SPAY,
    completedDate: null,
  });
});

test("an exemption holds on its review day and lapses the day after", () => {
  const onReview = exemption("2026-10-12");
  assert.deepEqual(spayNeuterStatus([onReview], TODAY), {
    status: "EXEMPT",
    entryId: onReview.id,
    reason: SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT,
    reviewDate: "2026-10-12",
  });
  assert.deepEqual(spayNeuterStatus([exemption("2026-10-11")], TODAY), {
    status: "UNKNOWN",
    lapsedOn: "2026-10-11",
  });
});

test("an exemption with no review day holds until it is voided", () => {
  const forGood = exemption(null, { exemptionReason: SpayNeuterExemptionReason.OTHER });
  assert.deepEqual(spayNeuterStatus([forGood], TODAY), {
    status: "EXEMPT",
    entryId: forGood.id,
    reason: SpayNeuterExemptionReason.OTHER,
    reviewDate: null,
  });
});

test("of two exemptions, one in force is enough, and the one that holds longest is shown", () => {
  const lapsed = exemption("2026-09-30");
  const holding = exemption("2026-11-03");
  const shorter = exemption("2026-10-20");
  const status = spayNeuterStatus([lapsed, holding, shorter], TODAY);
  assert.equal(status.status, "EXEMPT");
  assert.equal(status.status === "EXEMPT" && status.entryId, holding.id);
});

test("of several lapsed exemptions, the last to lapse dates the need", () => {
  assert.deepEqual(
    spayNeuterStatus([exemption("2026-10-01"), exemption("2026-09-20")], TODAY),
    { status: "UNKNOWN", lapsedOn: "2026-10-01" },
  );
});

test("an exemption with a review day is open for review until something replaces it", () => {
  const open = exemption("2026-10-10");
  assert.equal(openExemptionReview([open])?.id, open.id);
  // The review day hasn't come yet: still open, listed when it comes near.
  const ahead = exemption("2026-12-01");
  assert.equal(openExemptionReview([ahead])?.id, ahead.id);

  // A spay scheduled after it.
  assert.equal(openExemptionReview([open, scheduled()]), null);
  // A newer exemption: it is the one reviewed, if it has a review day.
  const newer = exemption("2026-11-01");
  assert.equal(openExemptionReview([open, newer])?.id, newer.id);
  assert.equal(openExemptionReview([open, exemption(null)]), null);
  // A spay given, whenever it was recorded.
  assert.equal(openExemptionReview([entry({}), exemption("2026-10-10")]), null);
});

test("a spay scheduled before the exemption doesn't replace it", () => {
  const early = scheduled();
  const later = exemption("2026-10-10");
  assert.equal(openExemptionReview([early, later])?.id, later.id);
});

test("an exemption declined from a spay scheduled earlier counts from when it was declined", () => {
  // Scheduled first, so its id comes first, but declined after the direct
  // exemption was written.
  const declinedLater = exemption("2026-11-15", {
    updatedAt: new Date(Date.UTC(2026, 9, 5)),
  });
  const direct = exemption("2026-10-10", { updatedAt: new Date(Date.UTC(2026, 9, 3)) });
  assert.equal(openExemptionReview([declinedLater, direct])?.id, declinedLater.id);
});

test("an exemption with no review day is never open for review", () => {
  assert.equal(openExemptionReview([exemption(null)]), null);
  assert.equal(openExemptionReview([]), null);
});
