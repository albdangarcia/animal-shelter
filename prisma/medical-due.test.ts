// The shelter-wide due list, against a real Postgres. It reads every animal's
// scheduled care, so each test looks only at the animals it made: other test
// files schedule care at the same time.
//
// `findMedicalDue` is the whole of `fetchMedicalDue` bar the permission check
// and the grouping, which has its own unit tests. `findMedicalDueForQueue` is
// the attention queue's medical signal; merging it with the other signals is
// unit-tested in `attention-queue.test.ts`.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  FosterPlacementType,
  FosterReturnReason,
  IntakeType,
  LocationType,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalItemKind,
  Sex,
  SpayNeuterExemptionReason,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  declineMedicalEntry,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
  recordSpayNeuterExemption,
  scheduleMedicalEntry,
  voidMedicalEntry,
} from "@/app/lib/services/medical-entry";
import { medicalEntryName } from "@/app/lib/utils/medical-entry-name";
import { createMedicalItem } from "@/app/lib/services/medical-catalog";
import type { CatalogEntryKind } from "@/app/lib/constants/medical";
import {
  findExemptionReviewsDue,
  findMedicalDue,
  findMedicalDueForQueue,
  groupMedicalDue,
  type MedicalDueListRow,
  type MedicalDueReviewRow,
} from "@/app/lib/data/medical-due";
import {
  calendarDay,
  shiftDayKey,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up the
// catalog items whose names end in its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");

let speciesId: string;
let colorId: string;
let staffId: string;
let fosterPersonId: string;
let fosterProfileId: string;
let locationId: string;
let unitId: string;
let vaccineId: string;
let treatmentId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Due species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Due color") },
      select: { id: true },
    })
  ).id;
  staffId = (
    await prisma.person.create({
      data: { name: name("Due staff") },
      select: { id: true },
    })
  ).id;
  fosterPersonId = (
    await prisma.person.create({
      data: { name: name("Due foster") },
      select: { id: true },
    })
  ).id;
  fosterProfileId = (
    await prisma.fosterProfile.create({
      data: { personId: fosterPersonId },
      select: { id: true },
    })
  ).id;
  locationId = (
    await prisma.location.create({
      data: { name: name("Due kennels"), type: LocationType.KENNEL },
      select: { id: true },
    })
  ).id;
  unitId = (
    await prisma.unit.create({
      data: { name: "D1", capacity: 4, locationId },
      select: { id: true },
    })
  ).id;
  const item = async (kind: MedicalItemKind, label: string) =>
    (
      await prisma.$transaction((tx) =>
        createMedicalItem(tx, {
          kind,
          name: name(label),
          speciesIds: [],
          analytes: [],
        }),
      )
    ).id;
  vaccineId = await item(MedicalItemKind.VACCINE, "Due vaccine");
  treatmentId = await item(MedicalItemKind.TREATMENT, "Due dewormer");
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({ where: { placedById: staffId } });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, their events and activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.unit.deleteMany({ where: { locationId } });
  await prisma.location.deleteMany({ where: { id: locationId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (
  label: string,
  options: { currentUnitId?: string } = {},
) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        listingStatus: AnimalListingStatus.PUBLISHED,
        currentUnitId: options.currentUnitId,
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

/**
 * Schedules care due `dueDate`. Care due before TODAY is scheduled as if on
 * an earlier day, when that day wasn't in the past.
 */
const schedule = async (
  animalId: string,
  dueDate: CalendarDay,
  kind: CatalogEntryKind = MedicalEntryKind.VACCINE,
) =>
  (
    await prisma.$transaction((tx) =>
      scheduleMedicalEntry(
        tx,
        {
          animalId,
          kind,
          itemId: kind === MedicalEntryKind.VACCINE ? vaccineId : treatmentId,
          dueDate,
        },
        staffId,
        dueDate < TODAY ? dueDate : TODAY,
      ),
    )
  ).entryId;

const placeInFoster = (animalId: string, endDate: string | null = null) =>
  prisma.fosterPlacement.create({
    data: {
      type: FosterPlacementType.GENERAL,
      startDate: "2026-08-10",
      endDate,
      returnReason: endDate ? FosterReturnReason.RETURNED_TO_SHELTER : null,
      animalId,
      fosterProfileId,
      placedById: staffId,
    },
  });

/** The due rows for these animals only. */
const dueFor = async (
  animalIds: string[],
  options: Parameters<typeof findMedicalDue>[2] = {},
): Promise<MedicalDueListRow[]> =>
  (await findMedicalDue(prisma, TODAY, options)).filter((row) =>
    animalIds.includes(row.animal.id),
  );

test("only open scheduled care is due: not given, declined, voided, or for an animal that has left", async () => {
  const animalId = await makeAnimal("Mixed");
  const open = await schedule(animalId, shiftDayKey(TODAY, -2));
  const given = await schedule(animalId, TODAY);
  await prisma.$transaction((tx) =>
    recordScheduledMedicalEntry(
      tx,
      given,
      {
        kind: MedicalEntryKind.VACCINE,
        itemId: vaccineId,
        completedDate: TODAY,
        source: MedicalEntrySource.IN_HOUSE,
      },
      staffId,
      TODAY,
    ),
  );
  const declined = await schedule(animalId, TODAY);
  await prisma.$transaction((tx) =>
    declineMedicalEntry(tx, declined, "Not needed.", staffId),
  );
  const voided = await schedule(animalId, TODAY);
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, voided, "Scheduled in error.", staffId),
  );

  // Scheduled while in care, then gone: its care stays open on its page.
  const leftId = await makeAnimal("Left");
  await schedule(leftId, TODAY);
  await prisma.animal.update({
    where: { id: leftId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });

  const rows = await dueFor([animalId, leftId]);
  assert.deepEqual(
    rows.map((row) => row.entry.id),
    [open],
  );
  const [row] = rows;
  assert.equal(row.entry.dueDate, shiftDayKey(TODAY, -2));
  assert.equal(row.entry.kind, MedicalEntryKind.VACCINE);
  assert.equal(row.entry.itemId, vaccineId);
  assert.equal(row.entry.item?.name, name("Due vaccine"));
  assert.deepEqual(row.animal, {
    id: animalId,
    name: name("Mixed"),
    species: name("Due species"),
    // What tells it from another animal of the same name.
    sex: "FEMALE",
    primaryColor: name("Due color"),
    birthDate: "2024-01-01",
  });
});

test("overdue, today and the next seven days are due; the eighth day isn't yet", async () => {
  const animalId = await makeAnimal("Boundaries");
  const longAgo = await schedule(animalId, shiftDayKey(TODAY, -30));
  const yesterday = await schedule(animalId, shiftDayKey(TODAY, -1));
  const today = await schedule(animalId, TODAY);
  const lastDay = await schedule(animalId, shiftDayKey(TODAY, 7));
  await schedule(animalId, shiftDayKey(TODAY, 8));

  const rows = await dueFor([animalId]);
  assert.deepEqual(
    groupMedicalDue(rows, TODAY).flatMap((group) =>
      group.sections.map((section) => [
        section.bucket,
        section.rows.map((row) => row.entry.id),
      ]),
    ),
    [
      ["OVERDUE", [longAgo, yesterday]],
      ["TODAY", [today]],
      ["UPCOMING", [lastDay]],
    ],
  );
});

test("each animal is placed where it is: its unit, its open foster placement, or neither", async () => {
  // A unit wins over an open placement, as on the housing board.
  const housed = await makeAnimal("Housed", { currentUnitId: unitId });
  await placeInFoster(housed);
  const inFoster = await makeAnimal("In foster");
  await placeInFoster(inFoster);
  const returned = await makeAnimal("Back from foster");
  await placeInFoster(returned, "2026-09-01");
  const unhoused = await makeAnimal("Unhoused");
  for (const animalId of [housed, inFoster, returned, unhoused]) {
    await schedule(animalId, TODAY);
  }

  const places = new Map(
    (await dueFor([housed, inFoster, returned, unhoused])).map((row) => [
      row.animal.id,
      row.place,
    ]),
  );
  assert.deepEqual(places.get(housed), {
    type: "UNIT",
    locationId,
    locationName: name("Due kennels"),
    unitId,
    unitName: "D1",
  });
  assert.deepEqual(places.get(inFoster), {
    type: "FOSTER",
    fosterPersonId,
    fosterName: name("Due foster"),
  });
  // An ended placement isn't fostering.
  assert.deepEqual(places.get(returned), { type: "NOT_HOUSED" });
  assert.deepEqual(places.get(unhoused), { type: "NOT_HOUSED" });
});

test("the kind filter keeps only the kinds asked for, and none means every kind", async () => {
  const animalId = await makeAnimal("Kinds");
  const vaccine = await schedule(animalId, TODAY);
  const treatment = await schedule(animalId, TODAY, MedicalEntryKind.TREATMENT);

  const ids = async (kinds: MedicalEntryKind[]) =>
    (await dueFor([animalId], { kinds })).map((row) => row.entry.id).sort();
  assert.deepEqual(await ids([MedicalEntryKind.TREATMENT]), [treatment]);
  assert.deepEqual(await ids([]), [vaccine, treatment].sort());
  assert.deepEqual(await ids([MedicalEntryKind.TEST]), []);
});

test("the attention queue takes open care due today or overdue, for animals in care, with the unit", async () => {
  const housed = await makeAnimal("Queue housed", { currentUnitId: unitId });
  const overdue = await schedule(housed, shiftDayKey(TODAY, -3));
  const dueToday = await schedule(housed, TODAY, MedicalEntryKind.TREATMENT);
  await schedule(housed, shiftDayKey(TODAY, 1));
  const voided = await schedule(housed, TODAY);
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, voided, "Scheduled in error.", staffId),
  );
  // Given and declined care keep their due days, which are past or today.
  const given = await schedule(housed, shiftDayKey(TODAY, -2));
  await prisma.$transaction((tx) =>
    recordScheduledMedicalEntry(
      tx,
      given,
      {
        kind: MedicalEntryKind.VACCINE,
        itemId: vaccineId,
        completedDate: TODAY,
        source: MedicalEntrySource.IN_HOUSE,
      },
      staffId,
      TODAY,
    ),
  );
  const declined = await schedule(housed, TODAY);
  await prisma.$transaction((tx) =>
    declineMedicalEntry(tx, declined, "Not needed.", staffId),
  );

  const unhoused = await makeAnimal("Queue unhoused");
  const unhousedDue = await schedule(unhoused, TODAY);

  const leftId = await makeAnimal("Queue left");
  await schedule(leftId, shiftDayKey(TODAY, -1));
  await prisma.animal.update({
    where: { id: leftId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });

  const mine = [housed, unhoused, leftId];
  const rows = (await findMedicalDueForQueue(prisma, TODAY)).filter((row) =>
    mine.includes(row.animal.id),
  );
  assert.deepEqual(
    rows.map((row) => row.entryId).sort(),
    [overdue, dueToday, unhousedDue].sort(),
  );

  const byEntry = new Map(rows.map((row) => [row.entryId, row]));
  assert.deepEqual(byEntry.get(overdue), {
    animal: {
      id: housed,
      name: name("Queue housed"),
      species: name("Due species"),
      currentUnit: `${name("Due kennels")} · D1`,
    },
    entryId: overdue,
    itemName: name("Due vaccine"),
    kind: MedicalEntryKind.VACCINE,
    dueDate: shiftDayKey(TODAY, -3),
  });
  assert.equal(byEntry.get(dueToday)?.kind, MedicalEntryKind.TREATMENT);
  assert.equal(byEntry.get(dueToday)?.itemName, name("Due dewormer"));
  assert.equal(byEntry.get(unhousedDue)?.animal.currentUnit, null);
});

test("a scheduled surgery and a microchip are due like other care, named by procedure and as a chip", async () => {
  const housed = await makeAnimal("Surgery and chip", { currentUnitId: unitId });
  const plan = (care: { kind: "SURGERY"; procedure: SurgeryProcedure } | { kind: "MICROCHIP" }) =>
    prisma.$transaction((tx) =>
      scheduleMedicalEntry(tx, { animalId: housed, ...care, dueDate: TODAY }, staffId, TODAY),
    );
  const spay = (await plan({ kind: MedicalEntryKind.SURGERY, procedure: SurgeryProcedure.SPAY })).entryId;
  const chip = (await plan({ kind: MedicalEntryKind.MICROCHIP })).entryId;

  const rows = await dueFor([housed]);
  assert.deepEqual(
    rows.map((row) => [row.entry.id, row.entry.kind, medicalEntryName(row.entry)]).sort(),
    [
      [spay, MedicalEntryKind.SURGERY, "Spay"],
      [chip, MedicalEntryKind.MICROCHIP, "Microchip"],
    ].sort(),
  );
  // The Surgery filter keeps the spay alone.
  assert.deepEqual(
    (await dueFor([housed], { kinds: [MedicalEntryKind.SURGERY] })).map((row) => row.entry.id),
    [spay],
  );
  // The attention queue names them the same way.
  const queue = (await findMedicalDueForQueue(prisma, TODAY)).filter(
    (row) => row.animal.id === housed,
  );
  assert.deepEqual(
    queue.map((row) => [row.entryId, row.itemName]).sort(),
    [
      [spay, "Spay"],
      [chip, "Microchip"],
    ].sort(),
  );
});

/**
 * Records a spay exemption reviewed on `reviewDate` (or never), as if on
 * `on`, the shelter's today when it was recorded, which a review day can't
 * be before.
 */
const exempt = async (
  animalId: string,
  reviewDate: CalendarDay | null,
  on: CalendarDay = reviewDate && reviewDate < TODAY ? reviewDate : TODAY,
) =>
  (
    await prisma.$transaction((tx) =>
      recordSpayNeuterExemption(
        tx,
        {
          animalId,
          procedure: SurgeryProcedure.SPAY,
          exemptionReason: SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT,
          reviewDate,
        },
        staffId,
        on,
      ),
    )
  ).entryId;

/** The reviews due for these animals only. */
const reviewsFor = async (animalIds: string[]): Promise<MedicalDueReviewRow[]> =>
  (await findExemptionReviewsDue(prisma, TODAY)).filter((row) =>
    animalIds.includes(row.animal.id),
  );

test("an exemption with a review day is due for review in its bucket, until something replaces it", async () => {
  // Due for review: lapsed two days ago, today, and on the window's last day.
  const lapsed = await makeAnimal("Review lapsed", { currentUnitId: unitId });
  const lapsedReview = await exempt(lapsed, shiftDayKey(TODAY, -2));
  const today = await makeAnimal("Review today");
  const todayReview = await exempt(today, TODAY);
  const lastDay = await makeAnimal("Review in a week");
  const lastDayReview = await exempt(lastDay, shiftDayKey(TODAY, 7));

  // Not yet, or never.
  const later = await makeAnimal("Review later");
  await exempt(later, shiftDayKey(TODAY, 8));
  const never = await makeAnimal("Never reviewed");
  await exempt(never, null);

  // Replaced: by a spay scheduled after it, a spay given, or a newer
  // exemption whose review is out of the window.
  const scheduled = await makeAnimal("Spay scheduled since");
  await exempt(scheduled, shiftDayKey(TODAY, -1));
  await prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      {
        animalId: scheduled,
        kind: MedicalEntryKind.SURGERY,
        procedure: SurgeryProcedure.SPAY,
        dueDate: shiftDayKey(TODAY, 3),
      },
      staffId,
      TODAY,
    ),
  );
  const given = await makeAnimal("Spayed since");
  await exempt(given, TODAY);
  await prisma.$transaction((tx) =>
    recordMedicalEntry(
      tx,
      {
        animalId: given,
        kind: MedicalEntryKind.SURGERY,
        procedure: SurgeryProcedure.SPAY,
        completedDate: TODAY,
        source: MedicalEntrySource.IN_HOUSE,
      },
      staffId,
      TODAY,
    ),
  );
  const extended = await makeAnimal("Exempt again");
  await exempt(extended, TODAY);
  await exempt(extended, shiftDayKey(TODAY, 60));

  // Voided, or the animal has left.
  const voided = await makeAnimal("Exemption voided");
  const voidedReview = await exempt(voided, TODAY);
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, voidedReview, "Recorded on the wrong animal.", staffId),
  );
  const left = await makeAnimal("Review left");
  await exempt(left, TODAY);
  await prisma.animal.update({
    where: { id: left },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });

  const mine = [lapsed, today, lastDay, later, never, scheduled, given, extended, voided, left];
  const reviews = await reviewsFor(mine);
  assert.deepEqual(
    reviews.map((row) => row.entry.id).sort(),
    [lapsedReview, todayReview, lastDayReview].sort(),
  );

  const lapsedRow = reviews.find((row) => row.animal.id === lapsed)!;
  assert.deepEqual(lapsedRow.entry, {
    id: lapsedReview,
    kind: MedicalEntryKind.SURGERY,
    procedure: SurgeryProcedure.SPAY,
    exemptionReason: SpayNeuterExemptionReason.TOO_YOUNG_OR_UNDERWEIGHT,
    declineReason: null,
    reviewDate: shiftDayKey(TODAY, -2),
  });
  assert.equal(lapsedRow.review, true);
  assert.equal(lapsedRow.animal.name, name("Review lapsed"));
  assert.equal(lapsedRow.place.type, "UNIT");

  // Bucketed by the review day, as care is by its due day.
  assert.deepEqual(
    groupMedicalDue([], TODAY, reviews).flatMap((group) =>
      group.sections.map((section) => [
        group.title,
        section.bucket,
        section.rows.map((row) => row.entry.id),
      ]),
    ),
    [
      [name("Due kennels"), "OVERDUE", [lapsedReview]],
      ["Not housed", "TODAY", [todayReview]],
      ["Not housed", "UPCOMING", [lastDayReview]],
    ],
  );

  // A spay scheduled in error, then voided, no longer replaces it.
  const planned = (
    await prisma.$transaction((tx) =>
      scheduleMedicalEntry(
        tx,
        {
          animalId: lapsed,
          kind: MedicalEntryKind.SURGERY,
          procedure: SurgeryProcedure.SPAY,
          dueDate: TODAY,
        },
        staffId,
        TODAY,
      ),
    )
  ).entryId;
  assert.deepEqual(await reviewsFor([lapsed]), []);
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, planned, "Scheduled in error.", staffId),
  );
  assert.deepEqual(
    (await reviewsFor([lapsed])).map((row) => row.entry.id),
    [lapsedReview],
  );
});
