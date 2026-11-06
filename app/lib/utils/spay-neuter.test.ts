import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MedicalEntryStatus,
  ReproductiveStatus,
  Sex,
  SpayNeuterExemptionReason,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import { calendarDay } from "./shelter-day";
import {
  openExemptionReview,
  procedureSexIssue,
  proceduresFor,
  spayNeuterHeldText,
  spayNeuterStatus,
  surgeryProcedureChoices,
  type SpayNeuterEntry,
  type SpayNeuterOnRecord,
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

const finding = (status: ReproductiveStatus) => ({
  entryId: "exam-1",
  examDate: calendarDay("2026-10-03"),
  status,
});

test("an exam that found the animal intact is Intact, when nothing else says otherwise", () => {
  assert.deepEqual(spayNeuterStatus([], TODAY, finding(ReproductiveStatus.INTACT)), {
    status: "INTACT",
    examEntryId: "exam-1",
    examDate: "2026-10-03",
    lapsedOn: null,
  });
  // A lapsed exemption still dates the need, as it does for Unknown.
  assert.deepEqual(
    spayNeuterStatus([exemption("2026-10-01")], TODAY, finding(ReproductiveStatus.INTACT)),
    {
      status: "INTACT",
      examEntryId: "exam-1",
      examDate: "2026-10-03",
      lapsedOn: "2026-10-01",
    },
  );
});

test("an exemption in force beats Intact, and a spay or neuter given beats both", () => {
  const holding = exemption("2026-11-03");
  assert.equal(
    spayNeuterStatus([holding], TODAY, finding(ReproductiveStatus.INTACT)).status,
    "EXEMPT",
  );
  assert.equal(
    spayNeuterStatus([holding, entry({})], TODAY, finding(ReproductiveStatus.INTACT)).status,
    "ALTERED",
  );
});

test("an exam that found the animal altered, or couldn't tell, leaves it Unknown", () => {
  for (const status of [ReproductiveStatus.ALTERED, ReproductiveStatus.UNDETERMINED]) {
    assert.deepEqual(spayNeuterStatus([], TODAY, finding(status)), {
      status: "UNKNOWN",
      lapsedOn: null,
    });
  }
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

test("a spay is for a female and a neuter for a male; unknown sex can have either", () => {
  assert.match(procedureSexIssue(SurgeryProcedure.SPAY, Sex.MALE) ?? "", /male/);
  assert.match(procedureSexIssue(SurgeryProcedure.NEUTER, Sex.FEMALE) ?? "", /female/);
  assert.equal(procedureSexIssue(SurgeryProcedure.SPAY, Sex.FEMALE), null);
  assert.equal(procedureSexIssue(SurgeryProcedure.NEUTER, Sex.MALE), null);
  assert.equal(procedureSexIssue(SurgeryProcedure.SPAY, Sex.UNKNOWN), null);
  assert.equal(procedureSexIssue(SurgeryProcedure.NEUTER, Sex.UNKNOWN), null);
  assert.equal(procedureSexIssue(SurgeryProcedure.DENTAL, Sex.MALE), null);

  const others = [
    SurgeryProcedure.DENTAL,
    SurgeryProcedure.AMPUTATION,
    SurgeryProcedure.ENUCLEATION,
    SurgeryProcedure.MASS_REMOVAL,
    SurgeryProcedure.OTHER,
  ];
  assert.deepEqual(proceduresFor(Sex.FEMALE), [SurgeryProcedure.SPAY, ...others]);
  assert.deepEqual(proceduresFor(Sex.MALE), [SurgeryProcedure.NEUTER, ...others]);
  assert.deepEqual(proceduresFor(Sex.UNKNOWN), Object.values(SurgeryProcedure));
});

const NOTHING_HELD: SpayNeuterOnRecord = { given: null, scheduled: null };
const SPAYED: SpayNeuterOnRecord = {
  given: { entryId: "spay", procedure: SurgeryProcedure.SPAY, day: null },
  scheduled: null,
};
const BOOKED: SpayNeuterOnRecord = {
  given: null,
  scheduled: {
    entryId: "booked",
    procedure: SurgeryProcedure.NEUTER,
    day: calendarDay("2026-10-14"),
  },
};
const WITHOUT_SPAY_NEUTER = Object.values(SurgeryProcedure).filter(
  (procedure) =>
    procedure !== SurgeryProcedure.SPAY && procedure !== SurgeryProcedure.NEUTER,
);

test("a surgery picker offers spay and neuter only while none is on the record", () => {
  assert.deepEqual(surgeryProcedureChoices(Sex.UNKNOWN, NOTHING_HELD), {
    procedures: Object.values(SurgeryProcedure),
    heldBy: null,
  });
  // One given, even on a day nobody knows, takes both off.
  assert.deepEqual(surgeryProcedureChoices(Sex.UNKNOWN, SPAYED), {
    procedures: WITHOUT_SPAY_NEUTER,
    heldBy: { ...SPAYED.given, status: "given" },
  });
  // Correcting that entry itself keeps them, under the sex rule.
  assert.deepEqual(
    surgeryProcedureChoices(Sex.FEMALE, SPAYED, { entryId: "spay", own: SurgeryProcedure.SPAY }),
    { procedures: proceduresFor(Sex.FEMALE), heldBy: null },
  );
  // A stale appointment's own spay isn't kept on offer.
  assert.deepEqual(
    surgeryProcedureChoices(Sex.FEMALE, SPAYED, { own: SurgeryProcedure.SPAY }).procedures,
    WITHOUT_SPAY_NEUTER,
  );
});

test("one scheduled holds the place only when scheduling", () => {
  assert.deepEqual(surgeryProcedureChoices(Sex.MALE, BOOKED).heldBy, null);
  assert.deepEqual(surgeryProcedureChoices(Sex.MALE, BOOKED, { scheduling: true }), {
    procedures: WITHOUT_SPAY_NEUTER,
    heldBy: { ...BOOKED.scheduled, status: "scheduled" },
  });
});

test("the note says what holds the place, and what to do instead", () => {
  assert.equal(
    spayNeuterHeldText({ ...SPAYED.given!, status: "given" }),
    "Already spayed on its record (date unknown), so spay and neuter aren't offered. Correct that entry, or record a follow-up surgery as Other.",
  );
  assert.equal(
    spayNeuterHeldText(
      { ...SPAYED.given!, day: calendarDay("2026-10-03"), status: "given" },
      SurgeryProcedure.SPAY,
    ),
    "Already spayed on its record (Oct 3, 2026). Void this scheduled spay instead.",
  );
  assert.equal(
    spayNeuterHeldText({ ...BOOKED.scheduled!, status: "scheduled" }),
    "A neuter is already scheduled for Oct 14, 2026, so spay and neuter aren't offered. Reschedule that one instead.",
  );
});
