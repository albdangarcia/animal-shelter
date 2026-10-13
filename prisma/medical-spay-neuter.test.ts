// Spay/neuter status and exemptions, against a real Postgres. The status is
// worked out from an animal's spay and neuter entries when someone looks; an
// exemption is a declined spay or neuter with a reason from a list and maybe
// a review day, recorded on its own or by declining one that was scheduled.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  IntakeType,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  Sex,
  SpayNeuterExemptionReason,
  SurgeryEvidence,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  MedicalEntryRefusal,
  declineMedicalEntry,
  recordMedicalEntry,
  recordSpayNeuterExemption,
  scheduleMedicalEntry,
  voidMedicalEntry,
  type RecordSpayNeuterExemptionInput,
} from "@/app/lib/services/medical-entry";
import {
  ALTERED_ENTRY_WHERE,
  ALTERED_OR_CHIPPED_SELECT,
  CURRENT_CHIP_WHERE,
  alteredAndChipped,
  findMedicalStatus,
  findSpayNeuterEntries,
} from "@/app/lib/data/animals/medical-status";
import { findMedicalHistoryPage } from "@/app/lib/data/animals/medical-entry";
import {
  findAnimalReadiness,
  findReadinessForAnimals,
} from "@/app/lib/data/animals/readiness";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;

let speciesId: string;
let colorId: string;
let staffId: string;
let editorId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Exempt species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Exempt color") },
      select: { id: true },
    })
  ).id;
  const person = async (label: string) =>
    (
      await prisma.person.create({
        data: { name: name(label) },
        select: { id: true },
      })
    ).id;
  staffId = await person("Exempt staff");
  editorId = await person("Exempt editor");
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, their details, events and activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, editorId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string, sex: Sex = Sex.FEMALE) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2026-05-01",
        sex,
        speciesId,
        primaryColorId: colorId,
        intake: {
          create: {
            type: IntakeType.STRAY,
            intakeDate: INTAKE_DAY,
            staffMemberId: staffId,
          },
        },
      },
      select: { id: true },
    })
  ).id;

const exemption = (
  animalId: string,
  overrides: Partial<RecordSpayNeuterExemptionInput> = {},
  today: CalendarDay = TODAY,
) =>
  prisma.$transaction((tx) =>
    recordSpayNeuterExemption(
      tx,
      {
        animalId,
        procedure: SurgeryProcedure.SPAY,
        exemptionReason: SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT,
        ...overrides,
      },
      staffId,
      today,
    ),
  );

const schedule = (animalId: string, procedure: SurgeryProcedure) =>
  prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      { animalId, kind: MedicalEntryKind.SURGERY, procedure, dueDate: day("2026-10-14") },
      staffId,
      TODAY,
    ),
  );

const spayGiven = (animalId: string, procedure: SurgeryProcedure = SurgeryProcedure.SPAY) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(
      tx,
      {
        animalId,
        kind: MedicalEntryKind.SURGERY,
        procedure,
        completedDate: null,
        source: MedicalEntrySource.BEFORE_INTAKE,
        evidence: SurgeryEvidence.SCAR,
      },
      staffId,
      TODAY,
    ),
  );

const chip = (animalId: string, chipNumber: string, completedDate: CalendarDay | null) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(
      tx,
      {
        animalId,
        kind: MedicalEntryKind.MICROCHIP,
        chipNumber,
        completedDate,
        source: completedDate
          ? MedicalEntrySource.IN_HOUSE
          : MedicalEntrySource.BEFORE_INTAKE,
      },
      staffId,
      TODAY,
    ),
  );

const voidEntry = (entryId: string, reason: string) =>
  prisma.$transaction((tx) => voidMedicalEntry(tx, entryId, reason, editorId));

const decline = (
  entryId: string,
  reason: string | null,
  terms?: { exemptionReason: SpayNeuterExemptionReason; reviewDate?: CalendarDay | null },
) =>
  prisma.$transaction((tx) =>
    declineMedicalEntry(
      tx,
      entryId,
      reason,
      editorId,
      terms ? { ...terms, today: TODAY } : null,
    ),
  );

const entryOf = (entryId: string) =>
  prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } });

const eventsOf = (entryId: string) =>
  prisma.medicalEntryEvent.findMany({
    where: { entryId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

const activityOf = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: {
      animalId,
      activityType: {
        in: [
          AnimalActivityType.MEDICAL_ENTRY_SCHEDULED,
          AnimalActivityType.MEDICAL_ENTRY_DECLINED,
          AnimalActivityType.MEDICAL_ENTRY_RECORDED,
          AnimalActivityType.MEDICAL_ENTRY_VOIDED,
        ],
      },
    },
    orderBy: { changedAt: "asc" },
    select: { activityType: true, changeSummary: true },
  });

/** Asserts the promise is refused on `field` with a message matching `pattern`. */
const refusedOn = async (
  promise: Promise<unknown>,
  field: string | undefined,
  pattern: RegExp,
) =>
  assert.rejects(promise, (error) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.field, field);
    assert.match(error.message, pattern);
    return true;
  });

test("an exemption recorded on its own is a declined spay with its reason and review day", async () => {
  const animalId = await makeAnimal("Exempt");
  const { entryId } = await exemption(animalId, {
    reviewDate: day("2026-11-03"),
  });

  const entry = await entryOf(entryId);
  assert.equal(entry.kind, MedicalEntryKind.SURGERY);
  assert.equal(entry.procedure, SurgeryProcedure.SPAY);
  assert.equal(entry.status, MedicalEntryStatus.DECLINED);
  assert.equal(entry.exemptionReason, SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT);
  assert.equal(entry.reviewDate, "2026-11-03");
  assert.equal(entry.declineReason, null);
  assert.equal(entry.dueDate, null);
  assert.equal(entry.source, null);
  assert.equal(entry.completedDate, null);
  assert.equal(entry.createdById, staffId);
  assert.equal(
    await prisma.surgeryDetails.count({ where: { entryId } }),
    0,
    "an exemption has no details row",
  );

  const events = await eventsOf(entryId);
  assert.deepEqual(
    events.map((event) => [event.action, event.before, event.after]),
    [
      [
        MedicalEntryEventAction.CREATED,
        null,
        {
          kind: MedicalEntryKind.SURGERY,
          status: MedicalEntryStatus.DECLINED,
          procedure: SurgeryProcedure.SPAY,
          exemptionReason: SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT,
          declineReason: null,
          reviewDate: "2026-11-03",
        },
      ],
    ],
  );
  assert.deepEqual(await activityOf(animalId), [
    {
      activityType: AnimalActivityType.MEDICAL_ENTRY_DECLINED,
      changeSummary:
        "Spay exemption recorded: too young or underweight. Review on Nov 3, 2026.",
    },
  ]);
});

test("an exemption's reason: from the list, with words required only for Other", async () => {
  const animalId = await makeAnimal("Reasons", Sex.MALE);
  const neuter = { procedure: SurgeryProcedure.NEUTER };
  await refusedOn(
    exemption(animalId, {
      ...neuter,
      exemptionReason: undefined as unknown as SpayNeuterExemptionReason,
    }),
    "exemptionReason",
    /Pick the reason/,
  );
  await refusedOn(
    exemption(animalId, {
      ...neuter,
      exemptionReason: SpayNeuterExemptionReason.OTHER,
      declineReason: "  ",
    }),
    "declineReason",
    /Say why the animal is exempt/,
  );
  await refusedOn(
    exemption(animalId, {
      ...neuter,
      exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK,
      declineReason: "x".repeat(1001),
    }),
    "declineReason",
    /cannot exceed 1000/,
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);

  // Other, with words and no review day: it holds until it is voided.
  const { entryId } = await exemption(animalId, {
    ...neuter,
    exemptionReason: SpayNeuterExemptionReason.OTHER,
    declineReason: " Not routinely done for this species ",
  });
  const entry = await entryOf(entryId);
  assert.equal(entry.declineReason, "Not routinely done for this species");
  assert.equal(entry.reviewDate, null);
  assert.equal(
    (await activityOf(animalId)).at(-1)?.changeSummary,
    "Neuter exemption recorded: other. Note: Not routinely done for this species",
  );
  // The other reasons can carry words too.
  await exemption(animalId, {
    ...neuter,
    exemptionReason: SpayNeuterExemptionReason.PARTNER_WILL_ALTER,
    declineReason: "Second Chance Rescue alters before adoption.",
  });
});

test("an exemption's review day is from today to five years ahead", async () => {
  const animalId = await makeAnimal("Review days");
  await refusedOn(
    exemption(animalId, { reviewDate: day("2026-10-09") }),
    "reviewDate",
    /^The review date can't be in the past\.$/,
  );
  await refusedOn(
    exemption(animalId, { reviewDate: day("2031-10-11") }),
    "reviewDate",
    /^The review date can't be more than 5 years/,
  );
  await exemption(animalId, { reviewDate: TODAY });
  await exemption(animalId, { reviewDate: day("2031-10-10") });
});

test("an exemption must be from a spay or neuter that suits the animal's sex", async () => {
  const male = await makeAnimal("Exempt male", Sex.MALE);
  const female = await makeAnimal("Exempt female", Sex.FEMALE);
  const unknown = await makeAnimal("Exempt unknown", Sex.UNKNOWN);
  await refusedOn(exemption(male), "procedure", /spay is for a female/);
  await refusedOn(
    exemption(female, { procedure: SurgeryProcedure.NEUTER }),
    "procedure",
    /neuter is for a male/,
  );
  await refusedOn(
    exemption(female, { procedure: SurgeryProcedure.DENTAL }),
    "procedure",
    /from a spay or a neuter/,
  );
  await exemption(unknown);
  await exemption(unknown, { procedure: SurgeryProcedure.NEUTER });
});

test("an animal already altered, or out of care, can't be made exempt", async () => {
  const altered = await makeAnimal("Already altered");
  await spayGiven(altered);
  await refusedOn(exemption(altered), undefined, /already spayed or neutered/);

  // Once that spay is voided, it doesn't count.
  const voided = await makeAnimal("Spay voided");
  const { entryId } = await spayGiven(voided);
  await voidEntry(entryId, "Recorded on the wrong animal.");
  await exemption(voided);

  const archived = await makeAnimal("Archived");
  await prisma.animal.update({
    where: { id: archived },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });
  await refusedOn(exemption(archived), undefined, /left the shelter's care/);
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: archived } }), 0);
});

test("a scheduled spay is declined only as an exemption", async () => {
  const animalId = await makeAnimal("Declined spay");
  const { entryId } = await schedule(animalId, SurgeryProcedure.SPAY);

  await refusedOn(decline(entryId, "Too young."), "exemptionReason", /records an exemption/);
  await refusedOn(
    decline(entryId, null, { exemptionReason: SpayNeuterExemptionReason.OTHER }),
    "reason",
    /Say why the animal is exempt/,
  );
  await refusedOn(
    decline(entryId, null, {
      exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK,
      reviewDate: day("2026-10-01"),
    }),
    "reviewDate",
    /past/,
  );
  assert.equal((await entryOf(entryId)).status, MedicalEntryStatus.SCHEDULED);

  // The reason in words is optional for any reason but Other.
  await decline(entryId, null, {
    exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK,
    reviewDate: day("2027-01-15"),
  });
  const entry = await entryOf(entryId);
  assert.equal(entry.status, MedicalEntryStatus.DECLINED);
  assert.equal(entry.exemptionReason, SpayNeuterExemptionReason.MEDICAL_RISK);
  assert.equal(entry.reviewDate, "2027-01-15");
  assert.equal(entry.declineReason, null);
  assert.equal(entry.dueDate, "2026-10-14");

  const declined = (await eventsOf(entryId)).at(-1);
  assert.equal(declined?.action, MedicalEntryEventAction.DECLINED);
  assert.deepEqual(declined?.before, { status: MedicalEntryStatus.SCHEDULED });
  assert.deepEqual(declined?.after, {
    status: MedicalEntryStatus.DECLINED,
    exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK,
    declineReason: null,
    reviewDate: "2027-01-15",
  });
  assert.deepEqual(
    (await activityOf(animalId)).map((row) => row.changeSummary),
    [
      "Spay surgery scheduled for Oct 14, 2026.",
      "Spay surgery due Oct 14, 2026 was declined as an exemption: medical risk. Review on Jan 15, 2027.",
    ],
  );
  const status = await findMedicalStatus(prisma, animalId, TODAY);
  assert.equal(status.spayNeuter.status, "EXEMPT");
});

test("a scheduled spay can't be declined as an exemption once the animal is spayed", async () => {
  // Spayed elsewhere while the appointment was still open.
  const animalId = await makeAnimal("Spayed before the appointment");
  const { entryId } = await schedule(animalId, SurgeryProcedure.SPAY);
  const { entryId: givenId } = await spayGiven(animalId);
  const terms = { exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK };

  await refusedOn(
    decline(entryId, null, terms),
    undefined,
    /^This animal is already spayed or neutered on its record, so it can't be exempt\. Void this scheduled spay instead\.$/,
  );
  const entry = await entryOf(entryId);
  assert.equal(entry.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(entry.exemptionReason, null);
  assert.deepEqual(
    (await eventsOf(entryId)).map((event) => event.action),
    [MedicalEntryEventAction.CREATED],
  );
  assert.equal(
    (await findMedicalStatus(prisma, animalId, TODAY)).spayNeuter.status,
    "ALTERED",
  );

  // Once that spay is voided, it doesn't count, and the exemption is taken.
  await voidEntry(givenId, "Recorded on the wrong animal.");
  await decline(entryId, null, terms);
  assert.equal((await entryOf(entryId)).status, MedicalEntryStatus.DECLINED);
});

test("a scheduled neuter declined as an exemption keeps the words given", async () => {
  const animalId = await makeAnimal("Declined neuter", Sex.MALE);
  const { entryId } = await schedule(animalId, SurgeryProcedure.NEUTER);
  await decline(entryId, "Heart murmur; anesthesia risk.", {
    exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK,
  });
  const entry = await entryOf(entryId);
  assert.equal(entry.declineReason, "Heart murmur; anesthesia risk.");
  assert.equal(entry.reviewDate, null);
  assert.equal(
    (await activityOf(animalId)).at(-1)?.changeSummary,
    "Neuter surgery due Oct 14, 2026 was declined as an exemption: medical risk. Note: Heart murmur; anesthesia risk.",
  );
});

test("other care can't be declined as an exemption", async () => {
  const animalId = await makeAnimal("Dental");
  const { entryId } = await schedule(animalId, SurgeryProcedure.DENTAL);
  await refusedOn(
    decline(entryId, "Teeth fine.", {
      exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK,
    }),
    "exemptionReason",
    /Only a spay or neuter/,
  );
  await refusedOn(decline(entryId, " "), "reason", /reason for declining/);
  assert.equal((await entryOf(entryId)).status, MedicalEntryStatus.SCHEDULED);
});

test("voiding an exemption says so", async () => {
  const animalId = await makeAnimal("Void exemption");
  const { entryId } = await exemption(animalId);
  await voidEntry(entryId, "Recorded on the wrong animal.");
  assert.equal(
    (await activityOf(animalId)).at(-1)?.changeSummary,
    "Spay exemption was voided. Reason: Recorded on the wrong animal.",
  );
});

test("the spay/neuter read leaves out voided entries and other surgeries", async () => {
  const animalId = await makeAnimal("Read");
  const other = await makeAnimal("Read other");
  const { entryId: kept } = await exemption(animalId);
  const { entryId: voided } = await exemption(animalId, {
    exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK,
  });
  await voidEntry(voided, "Duplicate.");
  await schedule(animalId, SurgeryProcedure.DENTAL);
  const { entryId: scheduled } = await schedule(animalId, SurgeryProcedure.SPAY);

  const byAnimal = await findSpayNeuterEntries(prisma, [animalId, other]);
  assert.deepEqual(
    byAnimal.get(animalId)?.map((entry) => entry.id),
    [kept, scheduled],
  );
  assert.deepEqual(byAnimal.get(other), []);
});

test("the medical status reads Altered, Exempt or Unknown, with the chips the animal carries", async () => {
  const unknown = await makeAnimal("Status unknown");
  const unknownStatus = await findMedicalStatus(prisma, unknown, TODAY);
  assert.deepEqual(unknownStatus, {
    spayNeuter: { status: "UNKNOWN", lapsedOn: null },
    exemptionReview: null,
    chips: [],
  });

  const exempt = await makeAnimal("Status exempt");
  const { entryId: exemptionId } = await exemption(exempt, {
    reviewDate: day("2026-11-03"),
  });
  const exemptStatus = await findMedicalStatus(prisma, exempt, TODAY);
  assert.deepEqual(exemptStatus.spayNeuter, {
    status: "EXEMPT",
    entryId: exemptionId,
    reason: SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT,
    reviewDate: "2026-11-03",
  });
  assert.equal(exemptStatus.exemptionReview?.id, exemptionId);
  // The day after the review day, it has lapsed, and is still open for
  // review.
  const lapsed = await findMedicalStatus(prisma, exempt, day("2026-11-04"));
  assert.deepEqual(lapsed.spayNeuter, { status: "UNKNOWN", lapsedOn: "2026-11-03" });
  assert.equal(lapsed.exemptionReview?.id, exemptionId);
  // Scheduling the spay replaces it.
  await schedule(exempt, SurgeryProcedure.SPAY);
  assert.equal((await findMedicalStatus(prisma, exempt, TODAY)).exemptionReview, null);

  const altered = await makeAnimal("Status altered", Sex.MALE);
  const { entryId: neuterId } = await spayGiven(altered, SurgeryProcedure.NEUTER);
  const base = `${runId}`.toUpperCase();
  const { entryId: older } = await chip(altered, `${base}000001`, null);
  const { entryId: newer } = await chip(altered, `${base}000002`, day("2026-09-01"));
  const { entryId: gone } = await chip(altered, `${base}000003`, day("2026-09-15"));
  await voidEntry(gone, "Mistyped.");

  const alteredStatus = await findMedicalStatus(prisma, altered, TODAY);
  assert.deepEqual(alteredStatus.spayNeuter, {
    status: "ALTERED",
    entryId: neuterId,
    procedure: SurgeryProcedure.NEUTER,
    completedDate: null,
  });
  assert.deepEqual(alteredStatus.chips, [
    {
      entryId: newer,
      chipNumber: `${base}000002`,
      brand: null,
      completedDate: "2026-09-01",
    },
    { entryId: older, chipNumber: `${base}000001`, brand: null, completedDate: null },
  ]);
});

test("readiness reads each animal's spay/neuter status from its record, on the day it is given", async () => {
  const nothing = await makeAnimal("Readiness nothing");
  const altered = await makeAnimal("Readiness altered");
  const exempt = await makeAnimal("Readiness exempt");
  const lapsed = await makeAnimal("Readiness lapsed");
  await spayGiven(altered);
  await exemption(exempt, {
    exemptionReason: SpayNeuterExemptionReason.MEDICAL_RISK,
  });
  // Recorded three weeks ago, to be reviewed five days ago.
  await exemption(lapsed, { reviewDate: day("2026-10-05") }, day("2026-09-19"));
  // Left care: frozen history, never on the board.
  const archived = await makeAnimal("Readiness archived");
  await prisma.animal.update({
    where: { id: archived },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });

  const timezone = "America/Los_Angeles";
  const animalIds = [nothing, altered, exempt, lapsed];
  // The spay/neuter blocker of each animal, as the single-animal read and
  // the board's read give it. The board's read is narrowed to this test's
  // animals, so other files deleting theirs mid-read can't reach it.
  const blockerSince = async (today: CalendarDay) => {
    const one = new Map<string, Date | null>();
    for (const animalId of animalIds) {
      const readiness = await findAnimalReadiness(prisma, animalId, {
        timezone,
        today,
      });
      const blocker = readiness?.blockers.find(
        (b) => b.kind === "NOT_SPAYED_NEUTERED",
      );
      one.set(animalId, blocker?.since ?? null);
    }
    const board = new Map<string, Date | null>();
    const boardRows = await findReadinessForAnimals(
      prisma,
      { timezone, today },
      { animalIds: [...animalIds, archived] },
    );
    assert.deepEqual(
      boardRows.map(({ animal }) => animal.id).sort(),
      [...animalIds].sort(),
      "the board lists exactly the animals in care it was asked for",
    );
    for (const { animal, blockers } of boardRows) {
      const blocker = blockers.find((b) => b.kind === "NOT_SPAYED_NEUTERED");
      board.set(animal.id, blocker?.since ?? null);
    }
    assert.deepEqual(board, one, "the board and the single read disagree");
    return one;
  };

  // The stay began Aug 1 in Los Angeles (07:00 UTC, daylight time).
  const stayBegan = new Date("2026-08-01T07:00:00Z");
  const onToday = await blockerSince(TODAY);
  assert.deepEqual(onToday.get(nothing), stayBegan);
  assert.equal(onToday.get(altered), null);
  assert.equal(onToday.get(exempt), null);
  // Needed from the start of the day after the review day.
  assert.deepEqual(onToday.get(lapsed), new Date("2026-10-06T07:00:00Z"));

  // On its review day the exemption still holds: the day given is the one
  // the status is read on, whatever the clock says.
  const onReviewDay = await blockerSince(day("2026-10-05"));
  assert.equal(onReviewDay.get(lapsed), null);
  assert.deepEqual(onReviewDay.get(nothing), stayBegan);
});

test("the altered and chipped fragments count only a spay given and a chip carried", async () => {
  const both = await makeAnimal("Fragments both");
  const exemptVoidedChip = await makeAnimal("Fragments exempt");
  const voidedSpayScheduledChip = await makeAnimal("Fragments voided spay");
  const chipOnly = await makeAnimal("Fragments chip only");
  const base = `${runId}`.toUpperCase();

  await spayGiven(both);
  await chip(both, `${base}000011`, day("2026-09-01"));
  await chip(both, `${base}000012`, null);

  await exemption(exemptVoidedChip);
  const { entryId: mistyped } = await chip(exemptVoidedChip, `${base}000013`, null);
  await voidEntry(mistyped, "Mistyped.");

  const { entryId: wrongSpay } = await spayGiven(voidedSpayScheduledChip);
  await voidEntry(wrongSpay, "Recorded on the wrong animal.");
  await prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      {
        animalId: voidedSpayScheduledChip,
        kind: MedicalEntryKind.MICROCHIP,
        dueDate: day("2026-10-20"),
      },
      staffId,
      TODAY,
    ),
  );

  await chip(chipOnly, `${base}000014`, day("2026-09-02"));

  const animalIds = [both, exemptVoidedChip, voidedSpayScheduledChip, chipOnly];
  const matching = async (where: typeof ALTERED_ENTRY_WHERE | typeof CURRENT_CHIP_WHERE) =>
    (
      await prisma.animal.findMany({
        where: { id: { in: animalIds }, medicalEntries: { some: where } },
        select: { id: true },
      })
    )
      .map((animal) => animal.id)
      .sort();
  assert.deepEqual(await matching(ALTERED_ENTRY_WHERE), [both]);
  assert.deepEqual(await matching(CURRENT_CHIP_WHERE), [both, chipOnly].sort());

  // As the public pages read them: one row at most per fact, whatever the
  // animal carries, mapped to two booleans.
  const rows = await prisma.animal.findMany({
    where: { id: { in: animalIds } },
    select: { id: true, medicalEntries: ALTERED_OR_CHIPPED_SELECT },
  });
  const facts = new Map(
    rows.map((row) => [row.id, alteredAndChipped(row.medicalEntries)]),
  );
  assert.equal(rows.find((row) => row.id === both)?.medicalEntries.length, 2);
  assert.deepEqual(facts.get(both), { isAltered: true, hasMicrochip: true });
  assert.deepEqual(facts.get(exemptVoidedChip), { isAltered: false, hasMicrochip: false });
  assert.deepEqual(facts.get(voidedSpayScheduledChip), {
    isAltered: false,
    hasMicrochip: false,
  });
  assert.deepEqual(facts.get(chipOnly), { isAltered: false, hasMicrochip: true });
});

test("History places an exemption recorded on its own by the shelter day it was recorded", async () => {
  const animalId = await makeAnimal("History");
  const { entryId: chipId } = await chip(
    animalId,
    `${runId.toUpperCase()}000009`,
    null,
  );
  const { entryId: dentalId } = await prisma.$transaction((tx) =>
    recordMedicalEntry(
      tx,
      {
        animalId,
        kind: MedicalEntryKind.SURGERY,
        procedure: SurgeryProcedure.DENTAL,
        completedDate: day("2026-10-09"),
        source: MedicalEntrySource.IN_HOUSE,
      },
      staffId,
      TODAY,
    ),
  );
  const { entryId: exemptionId } = await exemption(animalId);
  // The exemption was recorded at 03:00 UTC on Oct 10, which is the evening
  // of Oct 9 in Los Angeles; the dental was written two hours later.
  await prisma.medicalEntry.update({
    where: { id: exemptionId },
    data: { createdAt: new Date("2026-10-10T03:00:00Z") },
  });
  await prisma.medicalEntry.update({
    where: { id: dentalId },
    data: { createdAt: new Date("2026-10-10T05:00:00Z") },
  });

  const order = async (timeZone: string) =>
    (
      await findMedicalHistoryPage(prisma, animalId, {
        kinds: [],
        page: 1,
        perPage: 10,
        timeZone,
      })
    ).entries.map((entry) => entry.id);

  // On Oct 10, after the dental given the day before. The chip found before
  // intake on an unknown day stays last.
  assert.deepEqual(await order("UTC"), [exemptionId, dentalId, chipId]);
  // On Oct 9, the dental's day: the later write comes first.
  assert.deepEqual(await order("America/Los_Angeles"), [
    dentalId,
    exemptionId,
    chipId,
  ]);
});
