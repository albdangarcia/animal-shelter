// Medication doses against a real Postgres. First what the dose table itself
// holds to, beneath any service: a slot takes one live dose (a partial unique
// index that leaves voided doses out), as-needed doses have no slot and never
// clash, an order with doses can't be deleted, and an animal's deletion takes
// its orders and doses with it. Then the dose service, as the actions drive
// it: one slot recorded, several given together, and a void.
import { randomUUID } from "node:crypto";
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import {
  AnimalActivityType,
  AnimalListingStatus,
  DoseSlot,
  FosterPlacementType,
  LocationType,
  DoseUnit,
  MedicalItemKind,
  MedicalRoute,
  MedicationDoseResult,
  MedicationFrequency,
  MedicationOrderEventAction,
  Sex,
} from "@/prisma/generated/enums";
import { createMedicalItem } from "@/app/lib/services/medical-catalog";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import { MedicalBatchRefusal } from "@/app/lib/services/medical-batch";
import {
  createMedicationOrder,
  discontinueMedicationOrder,
  editMedicationOrder,
  voidMedicationOrder,
  type MedicationOrderInput,
} from "@/app/lib/services/medication-order";
import {
  recordMedicationDose,
  recordMedicationDosesGiven,
  voidMedicationDose,
  type MedicationBatchSlotRefusal,
  type MedicationDoseInput,
  type MedicationSlotInput,
} from "@/app/lib/services/medication-dose";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { findAnimalMedications } from "@/app/lib/data/animals/medication";
import {
  doseSheetSections,
  findDoseSheet,
  findMissedDosesForQueue,
} from "@/app/lib/data/medication-doses";
import { DEFAULT_DOSE_SLOT_ENDS } from "@/app/lib/utils/shelter-settings";
import {
  fallbackShelterSettings,
  resolveShelterSettings,
  shelterSettingsColumns,
} from "@/app/lib/utils/shelter-settings";
import {
  calendarDay,
  startOfShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import { ConflictError } from "@/app/lib/utils/errors";

// Random, not the time: the files run in parallel, and each cleans up the
// rows whose names end in its own runId.
const runId = randomUUID().slice(0, 8);

let speciesId: string;
let colorId: string;
let staffId: string;
let editorId: string;
let itemId: string;
let timezone: string;

before(async () => {
  timezone = resolveShelterSettings(
    await prisma.shelterSettings.findUnique({ where: { id: "shelter" } }),
  ).timezone;
  editorId = (
    await prisma.person.create({ data: { name: `Doses editor ${runId}` }, select: { id: true } })
  ).id;
  speciesId = (
    await prisma.species.create({ data: { name: `Doses species ${runId}` }, select: { id: true } })
  ).id;
  colorId = (
    await prisma.color.create({ data: { name: `Doses color ${runId}` }, select: { id: true } })
  ).id;
  staffId = (
    await prisma.person.create({ data: { name: `Doses staff ${runId}` }, select: { id: true } })
  ).id;
  itemId = (
    await prisma.$transaction((tx) =>
      createMedicalItem(tx, {
        kind: MedicalItemKind.MEDICATION,
        name: `Doxycycline ${runId}`,
        speciesIds: [],
        analytes: [],
      }),
    )
  ).id;
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({ where: { placedById: staffId } });
  // Takes the orders, their events and their doses with them.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.unit.deleteMany({ where: { location: { name: { endsWith: runId } } } });
  await prisma.location.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.fosterProfile.deleteMany({ where: { person: { name: { endsWith: runId } } } });
  await prisma.person.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const newAnimal = async () =>
  (
    await prisma.animal.create({
      data: {
        name: `Doses animal ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
      },
      select: { id: true },
    })
  ).id;

const newOrder = async (animalId: string, frequency: MedicationFrequency) =>
  (
    await prisma.medicationOrder.create({
      data: {
        animalId,
        itemId,
        doseAmount: 100,
        doseUnit: DoseUnit.MG,
        route: MedicalRoute.ORAL,
        frequency,
        startDate: "2026-10-12",
        firstSlot: frequency === MedicationFrequency.PRN ? null : DoseSlot.AM,
        createdById: staffId,
      },
      select: { id: true },
    })
  ).id;

const newDose = (
  orderId: string,
  animalId: string,
  slotDate: string,
  slot: DoseSlot | null,
) =>
  prisma.medicationDose.create({
    data: {
      orderId,
      animalId,
      slotDate,
      slot,
      result: MedicationDoseResult.GIVEN,
      administeredAt: new Date("2026-10-14T13:00:00Z"),
      administeredById: staffId,
      createdById: staffId,
    },
    select: { id: true },
  });

const failsWith = (code: string) => (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

test("a slot holds one live dose, and voiding it frees the slot", async () => {
  const animalId = await newAnimal();
  const orderId = await newOrder(animalId, MedicationFrequency.BID);
  const first = await newDose(orderId, animalId, "2026-10-14", DoseSlot.AM);

  await assert.rejects(newDose(orderId, animalId, "2026-10-14", DoseSlot.AM), failsWith("P2002"));
  // Another slot or another day of the same order is its own slot.
  await newDose(orderId, animalId, "2026-10-14", DoseSlot.PM);
  await newDose(orderId, animalId, "2026-10-15", DoseSlot.AM);

  await prisma.medicationDose.update({
    where: { id: first.id },
    data: { voidedAt: new Date(), voidedById: staffId, voidReason: "Recorded on the wrong day" },
  });
  const replacement = await newDose(orderId, animalId, "2026-10-14", DoseSlot.AM);
  // The replacement is live; another is refused again.
  await assert.rejects(newDose(orderId, animalId, "2026-10-14", DoseSlot.AM), failsWith("P2002"));

  const onSlot = await prisma.medicationDose.findMany({
    where: { orderId, slotDate: "2026-10-14", slot: DoseSlot.AM },
    orderBy: { createdAt: "asc" },
    select: { id: true, voidedAt: true },
  });
  assert.deepEqual(
    onSlot.map((dose) => [dose.id, dose.voidedAt !== null]),
    [
      [first.id, true],
      [replacement.id, false],
    ],
  );
});

test("as-needed doses have no slot, and any number fit on one day", async () => {
  const animalId = await newAnimal();
  const orderId = await newOrder(animalId, MedicationFrequency.PRN);
  await newDose(orderId, animalId, "2026-10-14", null);
  await newDose(orderId, animalId, "2026-10-14", null);
  await newDose(orderId, animalId, "2026-10-14", null);
  assert.equal(await prisma.medicationDose.count({ where: { orderId } }), 3);
});

test("an order with doses can't be deleted; deleting the animal takes its orders, events and doses", async () => {
  const animalId = await newAnimal();
  const orderId = await newOrder(animalId, MedicationFrequency.BID);
  await prisma.medicationOrderEvent.create({
    data: { orderId, action: MedicationOrderEventAction.CREATED, actorId: staffId },
  });
  await newDose(orderId, animalId, "2026-10-14", DoseSlot.AM);

  await assert.rejects(prisma.medicationOrder.delete({ where: { id: orderId } }), failsWith("P2003"));
  assert.equal(await prisma.medicationOrder.count({ where: { id: orderId } }), 1);

  await prisma.animal.delete({ where: { id: animalId } });
  assert.equal(await prisma.medicationOrder.count({ where: { animalId } }), 0);
  assert.equal(await prisma.medicationOrderEvent.count({ where: { orderId } }), 0);
  assert.equal(await prisma.medicationDose.count({ where: { animalId } }), 0);
});

// ---------------------------------------------------------------------------
// The dose service
// ---------------------------------------------------------------------------

const TODAY = calendarDay("2026-10-15");
const day = calendarDay;
/** Noon on `slotDate`, on the shelter's clock. */
const noonOn = (slotDate: CalendarDay) =>
  new Date(startOfShelterDay(slotDate, timezone).getTime() + 12 * 3_600_000);
const NOW = () => noonOn(TODAY);
const doxy = () => `Doxycycline ${runId}`;

const orderFor = async (animalId: string, overrides: Partial<MedicationOrderInput> = {}) =>
  (
    await prisma.$transaction((tx) =>
      createMedicationOrder(
        tx,
        {
          animalId,
          itemId,
          doseAmount: 100,
          doseUnit: DoseUnit.MG,
          route: MedicalRoute.ORAL,
          frequency: MedicationFrequency.BID,
          startDate: day("2026-10-12"),
          firstSlot: DoseSlot.PM,
          endDate: day("2026-10-20"),
          ...overrides,
        },
        staffId,
        TODAY,
      ),
    )
  ).orderId;

const editMedicationOrderFor = (
  tx: TransactionClient,
  orderId: string,
  correction: Parameters<typeof editMedicationOrder>[2],
) => editMedicationOrder(tx, orderId, correction, editorId, TODAY);

const record = (input: MedicationDoseInput, options: { now?: Date; today?: CalendarDay } = {}) =>
  prisma.$transaction((tx) =>
    recordMedicationDose(tx, input, staffId, options.today ?? TODAY, options.now ?? NOW()),
  );

const given = (orderId: string, slotDate: string, slot: DoseSlot | null): MedicationDoseInput => ({
  orderId,
  slotDate: day(slotDate),
  slot,
  result: MedicationDoseResult.GIVEN,
});

const recordGiven = (slots: MedicationSlotInput[]) =>
  prisma.$transaction(
    (tx) => recordMedicationDosesGiven(tx, slots, editorId, TODAY, NOW()),
    { timeout: 20_000 },
  );

const voidDose = (doseId: string, reason: string) =>
  prisma.$transaction((tx) => voidMedicationDose(tx, doseId, reason, editorId));

const dosesOf = (animalId: string) =>
  prisma.medicationDose.findMany({ where: { animalId }, orderBy: { createdAt: "asc" } });

const feedOf = async (animalId: string, type?: AnimalActivityType) =>
  (
    await prisma.animalActivityLog.findMany({
      where: { animalId, ...(type ? { activityType: type } : {}) },
      orderBy: { changedAt: "asc" },
      select: { changeSummary: true },
    })
  ).map((row) => row.changeSummary);

/** Runs `write`, expecting it refused (on `field`) with no dose or feed row
 * written. */
const assertRefused = async (
  animalId: string,
  write: () => Promise<unknown>,
  field: string | undefined,
  message: RegExp,
) => {
  const dosesBefore = await dosesOf(animalId);
  const feedBefore = await prisma.animalActivityLog.count({ where: { animalId } });
  await assert.rejects(write, (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.field, field);
    assert.match(error.message, message);
    return true;
  });
  assert.deepEqual(await dosesOf(animalId), dosesBefore);
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), feedBefore);
};

test("a dose given, refused or not given: the rows, and only the last two in the feed", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  const feedBefore = await feedOf(animalId);

  const givenAt = new Date(noonOn(day("2026-10-13")).getTime() - 3 * 3_600_000);
  const first = await record(
    { ...given(orderId, "2026-10-13", DoseSlot.AM), administeredAt: givenAt, notes: " Ate well. " },
  );
  assert.equal(first.animalId, animalId);
  const refused = await record({
    ...given(orderId, "2026-10-13", DoseSlot.PM),
    result: MedicationDoseResult.REFUSED,
  });
  const refusedWithReason = await record({
    ...given(orderId, "2026-10-14", DoseSlot.AM),
    result: MedicationDoseResult.REFUSED,
    reason: " Spat it out ",
  });
  const notGiven = await record({
    ...given(orderId, "2026-10-14", DoseSlot.PM),
    result: MedicationDoseResult.NOT_GIVEN,
    reason: "Out of stock until the afternoon delivery",
  });

  const rows = new Map((await dosesOf(animalId)).map((dose) => [dose.id, dose]));
  const firstRow = rows.get(first.doseId)!;
  assert.deepEqual(
    {
      orderId: firstRow.orderId,
      slotDate: firstRow.slotDate,
      slot: firstRow.slot,
      result: firstRow.result,
      reason: firstRow.reason,
      administeredAt: firstRow.administeredAt,
      administeredById: firstRow.administeredById,
      createdById: firstRow.createdById,
      notes: firstRow.notes,
      batchId: firstRow.batchId,
      voidedAt: firstRow.voidedAt,
    },
    {
      orderId,
      slotDate: "2026-10-13",
      slot: DoseSlot.AM,
      result: MedicationDoseResult.GIVEN,
      reason: null,
      administeredAt: givenAt,
      administeredById: staffId,
      createdById: staffId,
      notes: "Ate well.",
      batchId: null,
      voidedAt: null,
    },
  );
  // The time given defaults to now.
  assert.deepEqual(rows.get(refused.doseId)!.administeredAt, NOW());
  assert.equal(rows.get(refused.doseId)!.reason, null);
  assert.equal(rows.get(refusedWithReason.doseId)!.reason, "Spat it out");
  assert.equal(rows.get(notGiven.doseId)!.result, MedicationDoseResult.NOT_GIVEN);

  assert.deepEqual((await feedOf(animalId)).slice(feedBefore.length), [
    `${doxy()} PM dose on Oct 13, 2026: refused.`,
    `${doxy()} AM dose on Oct 14, 2026: refused. Reason: Spat it out`,
    `${doxy()} PM dose on Oct 14, 2026: not given. Reason: Out of stock until the afternoon delivery`,
  ]);
  assert.equal(
    (await feedOf(animalId, AnimalActivityType.MEDICATION_DOSE_NOT_GIVEN)).length,
    3,
  );
});

test("a dose's reason: required when not given, none when given, and not too long", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  await assertRefused(
    animalId,
    () => record({ ...given(orderId, "2026-10-13", DoseSlot.AM), result: MedicationDoseResult.NOT_GIVEN, reason: " " }),
    "reason",
    /^Say why the dose wasn't given\.$/,
  );
  await assertRefused(
    animalId,
    () => record({ ...given(orderId, "2026-10-13", DoseSlot.AM), reason: "Ate it" }),
    "reason",
    /^A dose given has no reason\.$/,
  );
  await assertRefused(
    animalId,
    () =>
      record({
        ...given(orderId, "2026-10-13", DoseSlot.AM),
        result: MedicationDoseResult.REFUSED,
        reason: "x".repeat(1001),
      }),
    "reason",
    /^The reason can't be longer than 1000 characters\.$/,
  );
});

test("a dose is refused for a slot the order doesn't expect", async () => {
  const animalId = await newAnimal();
  // Twice a day from the PM of Oct 12 through Oct 20.
  const orderId = await orderFor(animalId);
  const refused = (slotDate: string, slot: DoseSlot | null, message: RegExp) =>
    assertRefused(animalId, () => record(given(orderId, slotDate, slot)), undefined, message);

  await refused("2026-10-13", DoseSlot.MIDDAY, /^This order has no Midday dose\.$/);
  await refused("2026-10-13", null, /^A dose of this order needs its slot\.$/);
  await refused("2026-10-11", DoseSlot.PM, /^This order starts on Oct 12, 2026\.$/);
  await refused("2026-10-12", DoseSlot.AM, /^This order's first dose is the PM dose on Oct 12, 2026\.$/);
  await refused("2026-10-16", DoseSlot.AM, /^A dose can't be recorded for a future day\.$/);
  // Ended: an order that ran to yesterday.
  const ended = await orderFor(animalId, { endDate: day("2026-10-13") });
  await assertRefused(
    animalId,
    () => record(given(ended, "2026-10-14", DoseSlot.AM)),
    undefined,
    /^This order ended on Oct 13, 2026\.$/,
  );
  // Every few days: only its days.
  const everyThree = await orderFor(animalId, {
    frequency: MedicationFrequency.EVERY_N_DAYS,
    intervalDays: 3,
    firstSlot: DoseSlot.AM,
  });
  await assertRefused(
    animalId,
    () => record(given(everyThree, "2026-10-13", DoseSlot.AM)),
    undefined,
    /^This order isn't due on Oct 13, 2026: it is given every 3 days from Oct 12, 2026\.$/,
  );
  await record(given(everyThree, "2026-10-15", DoseSlot.AM));
  // Discontinued: from that day on.
  const stopped = await orderFor(animalId);
  await prisma.$transaction((tx) =>
    discontinueMedicationOrder(tx, stopped, { day: day("2026-10-14"), reason: "Done" }, staffId, TODAY),
  );
  await assertRefused(
    animalId,
    () => record(given(stopped, "2026-10-14", DoseSlot.AM)),
    undefined,
    /^This order was discontinued from Oct 14, 2026\.$/,
  );
  await record(given(stopped, "2026-10-13", DoseSlot.PM));
  // Voided.
  const voided = await orderFor(animalId);
  await prisma.$transaction((tx) => voidMedicationOrder(tx, voided, "Wrong animal", staffId));
  await assertRefused(
    animalId,
    () => record(given(voided, "2026-10-13", DoseSlot.AM)),
    undefined,
    /^This order was voided, so it takes no doses\.$/,
  );
  // A later slot today is fine: early is allowed.
  await record(given(orderId, "2026-10-15", DoseSlot.PM));
});

test("a dose's time: not in the future, and not before its slot's day began", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  await assertRefused(
    animalId,
    () =>
      record({
        ...given(orderId, "2026-10-14", DoseSlot.AM),
        administeredAt: new Date(NOW().getTime() + 1),
      }),
    "administeredAt",
    /^The time given can't be in the future\.$/,
  );
  const dayBegan = startOfShelterDay(day("2026-10-14"), timezone);
  await assertRefused(
    animalId,
    () =>
      record({
        ...given(orderId, "2026-10-14", DoseSlot.AM),
        administeredAt: new Date(dayBegan.getTime() - 1),
      }),
    "administeredAt",
    /^The time given can't be before Oct 14, 2026 began\.$/,
  );
  // At the day's first instant, and late the next morning, are both fine.
  await record({ ...given(orderId, "2026-10-14", DoseSlot.AM), administeredAt: dayBegan });
  await record({
    ...given(orderId, "2026-10-14", DoseSlot.PM),
    administeredAt: new Date(noonOn(day("2026-10-15")).getTime() - 4 * 3_600_000),
  });
  // Now itself is fine.
  await record({ ...given(orderId, "2026-10-15", DoseSlot.AM), administeredAt: NOW() });
});

test("a dose's day begins in the shelter's stored time zone, not the fallback", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  const OCT_15 = day("2026-10-15");
  // A stored zone whose Oct 15 begins at another instant than in the zone
  // the service would read without the row and in the one this file found,
  // whatever the environment's fallback is. Those two rule out at most two
  // instants, so one of three zones with three different midnights is left.
  const unstored = [timezone, fallbackShelterSettings().timezone].map((zone) =>
    startOfShelterDay(OCT_15, zone).getTime(),
  );
  const stored = ["Pacific/Kiritimati", "Etc/GMT+12", "UTC"].find(
    (zone) => !unstored.includes(startOfShelterDay(OCT_15, zone).getTime()),
  );
  assert.ok(stored);
  // Its day's first instant, and the one before it. A service reading
  // another zone gets one of the two wrong: a later midnight accepts the
  // instant before; an earlier one refuses the midnight itself.
  const midnight = startOfShelterDay(OCT_15, stored);
  const before = new Date(midnight.getTime() - 1);
  // Later than Oct 15 begins anywhere, so "not in the future" never decides.
  const now = new Date("2026-10-16T12:00:00Z");

  // The settings row is set and the doses written in one transaction that is
  // rolled back, so no other file ever reads the stored zone.
  const rolledBack = new Error("rolled back");
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const columns = { ...shelterSettingsColumns(fallbackShelterSettings()), timezone: stored };
      await tx.shelterSettings.upsert({
        where: { id: "shelter" },
        create: { id: "shelter", ...columns },
        update: { timezone: stored },
      });
      await assert.rejects(
        recordMedicationDose(
          tx,
          { ...given(orderId, "2026-10-15", DoseSlot.AM), administeredAt: before },
          staffId,
          TODAY,
          now,
        ),
        (error: unknown) =>
          error instanceof MedicalEntryRefusal &&
          error.field === "administeredAt" &&
          error.message === "The time given can't be before Oct 15, 2026 began.",
      );
      const { doseId } = await recordMedicationDose(
        tx,
        { ...given(orderId, "2026-10-15", DoseSlot.AM), administeredAt: midnight },
        staffId,
        TODAY,
        now,
      );
      assert.ok(doseId);
      throw rolledBack;
    }),
    (error: unknown) => error === rolledBack,
  );
  assert.equal((await dosesOf(animalId)).length, 0);
});

test("a dose is refused for an animal that left, and for a slot already recorded", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  await record(given(orderId, "2026-10-13", DoseSlot.AM));
  await assertRefused(
    animalId,
    () => record({ ...given(orderId, "2026-10-13", DoseSlot.AM), result: MedicationDoseResult.REFUSED }),
    undefined,
    /^The AM dose on Oct 13, 2026 is already recorded\.$/,
  );

  await prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });
  await assertRefused(
    animalId,
    () => record(given(orderId, "2026-10-13", DoseSlot.PM)),
    undefined,
    /^This animal has left the shelter's care, so no dose can be recorded for it\.$/,
  );
});

test("as needed: any number of doses a day, with no slot", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId, {
    frequency: MedicationFrequency.PRN,
    firstSlot: null,
    endDate: null,
  });
  await record(given(orderId, "2026-10-14", null));
  await record({ ...given(orderId, "2026-10-14", null), result: MedicationDoseResult.REFUSED });
  await record(given(orderId, "2026-10-14", null));
  assert.equal((await dosesOf(animalId)).length, 3);
  assert.equal(
    (await feedOf(animalId, AnimalActivityType.MEDICATION_DOSE_NOT_GIVEN)).at(-1),
    `${doxy()} as-needed dose on Oct 14, 2026: refused.`,
  );
  await assertRefused(
    animalId,
    () => record(given(orderId, "2026-10-14", DoseSlot.AM)),
    undefined,
    /^An as-needed dose has no slot\.$/,
  );
});

test("a void is written once, and frees the slot for the dose again", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  const { doseId } = await record(given(orderId, "2026-10-13", DoseSlot.AM));

  await assertRefused(
    animalId,
    () => voidDose(doseId, " "),
    "reason",
    /^A reason for voiding this dose is required\.$/,
  );
  await voidDose(doseId, " Recorded on the wrong day ");
  const voided = await prisma.medicationDose.findUniqueOrThrow({ where: { id: doseId } });
  assert.ok(voided.voidedAt);
  assert.equal(voided.voidedById, editorId);
  assert.equal(voided.voidReason, "Recorded on the wrong day");
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.MEDICATION_DOSE_VOIDED), [
    `${doxy()} AM dose on Oct 13, 2026, given, was voided. Reason: Recorded on the wrong day`,
  ]);

  await assert.rejects(
    voidDose(doseId, "Again"),
    (error: unknown) =>
      error instanceof ConflictError && /^This dose has already been voided\./.test(error.message),
  );
  const again = await record(given(orderId, "2026-10-13", DoseSlot.AM));
  assert.notEqual(again.doseId, doseId);
});

test("two doses for one slot at once: the second waits for the lock, then is refused", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  await assert.rejects(
    overlap(
      (tx) => recordMedicationDose(tx, given(orderId, "2026-10-13", DoseSlot.AM), staffId, TODAY, NOW()),
      (tx) =>
        recordMedicationDose(
          tx,
          { ...given(orderId, "2026-10-13", DoseSlot.AM), result: MedicationDoseResult.REFUSED },
          editorId,
          TODAY,
          NOW(),
        ),
    ),
    (error: unknown) =>
      error instanceof MedicalEntryRefusal &&
      error.message === "The AM dose on Oct 13, 2026 is already recorded.",
  );
  const doses = await dosesOf(animalId);
  assert.equal(doses.length, 1);
  assert.equal(doses[0].result, MedicationDoseResult.GIVEN);
});

test("a dose recorded while its order is being voided waits for the void, then is refused", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  await assert.rejects(
    overlap(
      (tx) => voidMedicationOrder(tx, orderId, "Wrong animal", editorId),
      (tx) => recordMedicationDose(tx, given(orderId, "2026-10-13", DoseSlot.AM), staffId, TODAY, NOW()),
    ),
    (error: unknown) =>
      error instanceof MedicalEntryRefusal &&
      error.message === "This order was voided, so it takes no doses.",
  );
  assert.equal((await dosesOf(animalId)).length, 0);
});

test("a dose written past the animal's lock is still kept to one per slot, by the index", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  // The holder writes a dose without the lock, so the service's own check
  // can't see it; the service's insert then waits on the index, and is
  // refused once the holder commits.
  await assert.rejects(
    overlap(
      (tx) => newDoseIn(tx, orderId, animalId, "2026-10-13", DoseSlot.AM),
      (tx) => recordMedicationDose(tx, given(orderId, "2026-10-13", DoseSlot.AM), editorId, TODAY, NOW()),
    ),
    (error: unknown) =>
      error instanceof MedicalEntryRefusal &&
      error.message === "The AM dose on Oct 13, 2026 is already recorded.",
  );
  assert.equal((await dosesOf(animalId)).length, 1);
});

test("a batch whose slot is taken past the lock still tries its other slots, then is refused whole", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  // The AM's insert waits on the holder's dose, which the index refuses once
  // it commits; the batch then tries the next two slots, refusing one, and
  // reports both refusals with nothing written.
  await assert.rejects(
    overlap(
      (tx) => newDoseIn(tx, orderId, animalId, "2026-10-13", DoseSlot.AM),
      (tx) =>
        recordMedicationDosesGiven(
          tx,
          [
            { orderId, slotDate: day("2026-10-13"), slot: DoseSlot.AM },
            { orderId, slotDate: day("2026-10-16"), slot: DoseSlot.PM },
            { orderId, slotDate: day("2026-10-13"), slot: DoseSlot.PM },
          ],
          editorId,
          TODAY,
          NOW(),
        ),
    ),
    (error: unknown) => {
      assert.ok(error instanceof MedicalBatchRefusal, String(error));
      assert.deepEqual(
        error.refusals.map((refusal) => refusal.message),
        [
          `${doxy()} AM dose on Oct 13, 2026: The AM dose on Oct 13, 2026 is already recorded.`,
          `${doxy()} PM dose on Oct 16, 2026: A dose can't be recorded for a future day.`,
        ],
      );
      return true;
    },
  );
  // Only the holder's dose.
  assert.equal((await dosesOf(animalId)).length, 1);
});

test("a dose whose insert fails on a lost connection reports that failure, not the rollback's", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId);
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: (pid: number) => void;
  const isHeld = new Promise<number>((resolve) => (held = resolve));
  // Holds a dose on the slot, uncommitted and past the animal's lock, so the
  // service's insert waits on the index.
  const holder = prisma.$transaction(
    async (tx) => {
      await newDoseIn(tx, orderId, animalId, "2026-10-13", DoseSlot.AM);
      held(await backendPid(tx));
      await released;
      // Rolled back: the slot stays free.
      throw new Error("holder rolled back");
    },
    { timeout: 20_000 },
  );
  void holder.catch(() => {});
  let waiter: Promise<unknown> | undefined;
  try {
    // The holder's dose is in before the waiter starts, so the waiter's
    // insert can only wait on it, never land first.
    const holderPid = await Promise.race([isHeld, holder as Promise<never>]);
    let started!: (pid: number) => void;
    const isStarted = new Promise<number>((resolve) => (started = resolve));
    waiter = prisma.$transaction(
      async (tx) => {
        started(await backendPid(tx));
        return recordMedicationDose(tx, given(orderId, "2026-10-13", DoseSlot.AM), editorId, TODAY, NOW());
      },
      { timeout: 20_000 },
    );
    void waiter.catch(() => {});
    const waiterPid = await Promise.race([isStarted, waiter as Promise<never>]);
    await waitForBlockedBy(waiterPid, holderPid);
    // Ends the waiting session, as a lost connection would: its insert fails,
    // and so does the rollback to the savepoint on that connection.
    await prisma.$queryRaw`SELECT pg_terminate_backend(${waiterPid}::int)`;
    await assert.rejects(waiter, (error: unknown) => {
      assert.ok(!(error instanceof MedicalEntryRefusal), String(error));
      assert.ok(error instanceof Error);
      assert.match(error.message, /terminat/i);
      assert.doesNotMatch(error.message, /^Connection terminated unexpectedly$/);
      return true;
    });
  } finally {
    release();
    await Promise.allSettled([holder, ...(waiter ? [waiter] : [])]);
  }
  assert.equal((await dosesOf(animalId)).length, 0);
});

test("several slots given at once share a batch id, and write no feed rows", async () => {
  const first = await newAnimal();
  const second = await newAnimal();
  const firstOrder = await orderFor(first);
  const secondOrder = await orderFor(second, { frequency: MedicationFrequency.TID, firstSlot: DoseSlot.AM });
  const feedBefore = (await feedOf(first)).length + (await feedOf(second)).length;

  const slots: MedicationSlotInput[] = [
    { orderId: secondOrder, slotDate: day("2026-10-14"), slot: DoseSlot.MIDDAY },
    { orderId: firstOrder, slotDate: day("2026-10-14"), slot: DoseSlot.AM },
    { orderId: firstOrder, slotDate: day("2026-10-14"), slot: DoseSlot.PM },
  ];
  const { batchId, doses } = await recordGiven(slots);
  assert.equal(doses.length, 3);
  const written = [...(await dosesOf(first)), ...(await dosesOf(second))];
  assert.equal(written.length, 3);
  for (const dose of written) {
    assert.equal(dose.batchId, batchId);
    assert.equal(dose.result, MedicationDoseResult.GIVEN);
    assert.equal(dose.administeredById, editorId);
    assert.deepEqual(dose.administeredAt, NOW());
  }
  assert.equal((await feedOf(first)).length + (await feedOf(second)).length, feedBefore);
});

test("a batch with a refused slot writes nothing, and names each refused slot", async () => {
  const first = await newAnimal();
  const second = await newAnimal();
  const firstOrder = await orderFor(first);
  const secondOrder = await orderFor(second);
  await record(given(secondOrder, "2026-10-14", DoseSlot.AM));
  const before = [...(await dosesOf(first)), ...(await dosesOf(second))];
  const animalName = `Doses animal ${runId}`;

  await assert.rejects(
    recordGiven([
      { orderId: firstOrder, slotDate: day("2026-10-14"), slot: DoseSlot.AM },
      { orderId: secondOrder, slotDate: day("2026-10-14"), slot: DoseSlot.AM },
      { orderId: firstOrder, slotDate: day("2026-10-16"), slot: DoseSlot.AM },
    ]),
    (error: unknown) => {
      assert.ok(error instanceof MedicalBatchRefusal, String(error));
      assert.equal(error.message, "Nothing was saved: 2 doses were refused.");
      assert.deepEqual(
        error.refusals.map((refusal) => {
          const { animalId, animalName: named, orderId, slotDate, slot, message } =
            refusal as MedicationBatchSlotRefusal;
          return { animalId, named, orderId, slotDate, slot, message };
        }),
        [
          {
            animalId: second,
            named: animalName,
            orderId: secondOrder,
            slotDate: "2026-10-14",
            slot: DoseSlot.AM,
            message: `${doxy()} AM dose on Oct 14, 2026: The AM dose on Oct 14, 2026 is already recorded.`,
          },
          {
            animalId: first,
            named: animalName,
            orderId: firstOrder,
            slotDate: "2026-10-16",
            slot: DoseSlot.AM,
            message: `${doxy()} AM dose on Oct 16, 2026: A dose can't be recorded for a future day.`,
          },
        ],
      );
      return true;
    },
  );
  assert.deepEqual([...(await dosesOf(first)), ...(await dosesOf(second))], before);
});

test("a batch is one to fifty slots, each listed once", async () => {
  const animalId = await newAnimal();
  const orderId = await orderFor(animalId, { startDate: day("2026-09-01"), firstSlot: DoseSlot.AM });
  const refused = (slots: MedicationSlotInput[], message: RegExp) =>
    assertRefused(animalId, () => recordGiven(slots), "slots", message);

  await refused([], /^Pick at least one dose\.$/);
  const slot = { orderId, slotDate: day("2026-10-13"), slot: DoseSlot.AM };
  await refused([slot, { ...slot }], /^A dose is listed more than once\.$/);
  // Fifty-one distinct slots, every one the order expects.
  const many: MedicationSlotInput[] = [];
  for (let offset = 0; many.length < 51; offset++) {
    const slotDate = calendarDay(new Date(Date.UTC(2026, 8, 1 + offset)).toISOString().slice(0, 10));
    many.push({ orderId, slotDate, slot: DoseSlot.AM }, { orderId, slotDate, slot: DoseSlot.PM });
  }
  await refused(many.slice(0, 51), /^At most 50 doses can be recorded at once\./);
  const { doses } = await recordGiven(many.slice(0, 50));
  assert.equal(doses.length, 50);
});

test("two batches over the same animals, listed in opposite orders, both finish", async () => {
  const animalIds = [await newAnimal(), await newAnimal(), await newAnimal()];
  const orders = new Map<string, string>();
  for (const animalId of animalIds) orders.set(animalId, await orderFor(animalId));
  const sorted = [...animalIds].sort();
  const slotsOf = (ids: string[], slot: DoseSlot) =>
    ids.map((animalId) => ({ orderId: orders.get(animalId)!, slotDate: day("2026-10-14"), slot }));

  // Holds the animal both batches lock first, so both are waiting on it at
  // once. Were the locks taken in the order listed, the backward batch would
  // hold the others by then, and the two would deadlock once it is released.
  const holder = await holdOpen(async (tx) => {
    await lockAnimal(tx, sorted[0]);
    return backendPid(tx);
  });
  const both = Promise.allSettled([
    recordGiven(slotsOf(sorted, DoseSlot.AM)),
    recordGiven(slotsOf([...sorted].reverse(), DoseSlot.PM)),
  ]);
  await waitForSessionsQueuedBehind(holder.result, 2);
  holder.release();
  await holder.done;
  const [forward, backward] = await both;
  assert.equal(forward.status, "fulfilled", String((forward as PromiseRejectedResult).reason));
  assert.equal(backward.status, "fulfilled", String((backward as PromiseRejectedResult).reason));
  assert.equal(
    await prisma.medicationDose.count({ where: { animalId: { in: animalIds } } }),
    6,
  );
});

// ---------------------------------------------------------------------------
// The reads
// ---------------------------------------------------------------------------

const animalIn = async (
  label: string,
  where: { unitId?: string; fosterProfileId?: string; archived?: boolean } = {},
) => {
  const { id } = await prisma.animal.create({
    data: {
      name: `${label} ${runId}`,
      birthDate: "2024-01-01",
      sex: Sex.MALE,
      speciesId,
      primaryColorId: colorId,
      currentUnitId: where.unitId,
    },
    select: { id: true },
  });
  if (where.fosterProfileId) {
    await prisma.fosterPlacement.create({
      data: {
        type: FosterPlacementType.GENERAL,
        startDate: "2026-10-01",
        animalId: id,
        fosterProfileId: where.fosterProfileId,
        placedById: staffId,
      },
    });
  }
  return id;
};

const archive = (animalId: string) =>
  prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });

const discontinueFrom = (orderId: string, from: string) =>
  prisma.$transaction((tx) =>
    discontinueMedicationOrder(tx, orderId, { day: day(from), reason: "Course changed" }, staffId, TODAY),
  );

const voidOrder = (orderId: string) =>
  prisma.$transaction((tx) => voidMedicationOrder(tx, orderId, "Wrong animal", staffId));

const newMedication = async (label: string) =>
  (
    await prisma.$transaction((tx) =>
      createMedicalItem(tx, {
        kind: MedicalItemKind.MEDICATION,
        name: `${label} ${runId}`,
        speciesIds: [],
        analytes: [],
      }),
    )
  ).id;

test("an animal's orders, latest start first, with their events and the doses in the range", async () => {
  const animalId = await newAnimal();
  const course = await orderFor(animalId);
  const asNeeded = await orderFor(animalId, {
    frequency: MedicationFrequency.PRN,
    firstSlot: null,
    startDate: day("2026-10-14"),
  });
  const voided = await orderFor(animalId, {
    frequency: MedicationFrequency.SID,
    firstSlot: DoseSlot.AM,
    startDate: day("2026-10-10"),
  });
  await voidOrder(voided);
  await prisma.$transaction((tx) =>
    editMedicationOrderFor(tx, course, { instructions: "With food." }),
  );

  const pm = await record(given(course, "2026-10-12", DoseSlot.PM));
  // The 13th's PM recorded before its AM: doses read by slot.
  const earlierSlot = await record({
    ...given(course, "2026-10-13", DoseSlot.PM),
    result: MedicationDoseResult.REFUSED,
  });
  const wrong = await record(given(course, "2026-10-13", DoseSlot.AM));
  await voidDose(wrong.doseId, "Recorded on the wrong day");
  const again = await record(given(course, "2026-10-13", DoseSlot.AM));
  await record(given(course, "2026-10-14", DoseSlot.AM));
  await record(given(asNeeded, "2026-10-14", null));

  const { orders, names } = await findAnimalMedications(prisma, animalId, {
    fromDay: day("2026-10-12"),
    toDay: day("2026-10-13"),
  });
  assert.deepEqual(
    orders.map((order) => order.id),
    [asNeeded, course, voided],
  );
  const [prn, bid, sid] = orders;
  assert.equal(bid.itemName, doxy());
  assert.equal(bid.instructions, "With food.");
  assert.deepEqual(bid.slotOrder, {
    frequency: MedicationFrequency.BID,
    intervalDays: null,
    startDate: "2026-10-12",
    firstSlot: DoseSlot.PM,
    endDate: "2026-10-20",
    discontinuedDate: null,
    voided: false,
  });
  assert.deepEqual(
    bid.events.map((event) => [event.action, event.actorId]),
    [
      [MedicationOrderEventAction.CREATED, staffId],
      [MedicationOrderEventAction.EDITED, editorId],
    ],
  );
  assert.deepEqual(
    bid.doses.map((dose) => [dose.id, dose.slotDate, dose.slot, dose.voided]),
    [
      [pm.doseId, "2026-10-12", DoseSlot.PM, false],
      [wrong.doseId, "2026-10-13", DoseSlot.AM, true],
      [again.doseId, "2026-10-13", DoseSlot.AM, false],
      [earlierSlot.doseId, "2026-10-13", DoseSlot.PM, false],
    ],
  );
  assert.equal(bid.doses[1].voidReason, "Recorded on the wrong day");
  // Out of the range: the PRN dose and the 14th's AM.
  assert.deepEqual(prn.doses, []);
  assert.equal(sid.slotOrder.voided, true);
  assert.equal(sid.voidReason, "Wrong animal");
  assert.equal(names[staffId], `Doses staff ${runId}`);
  assert.equal(names[editorId], `Doses editor ${runId}`);
  // The medication a CREATED event names.
  assert.equal(names[itemId], doxy());
});

test("the dose sheet for a day: the slots each order has, its doses, and where its animal is", async () => {
  const location = await prisma.location.create({
    data: { name: `Medical wing ${runId}`, type: LocationType.MEDICAL },
    select: { id: true, name: true },
  });
  const unit = await prisma.unit.create({
    data: { name: "MED-1", capacity: 2, locationId: location.id },
    select: { id: true },
  });
  const fosterPerson = await prisma.person.create({
    data: { name: `Doses foster ${runId}` },
    select: { id: true, name: true },
  });
  const fosterProfile = await prisma.fosterProfile.create({
    data: { personId: fosterPerson.id },
    select: { id: true },
  });
  const housed = await animalIn("Housed", { unitId: unit.id });
  const fostered = await animalIn("Fostered", { fosterProfileId: fosterProfile.id });
  const unhoused = await animalIn("Unhoused");
  const left = await animalIn("Left");
  const SHEET_DAY = day("2026-10-14");

  const bid = await orderFor(housed);
  const am = await record(given(bid, "2026-10-14", DoseSlot.AM));
  // A voided dose leaves its slot as if none was recorded.
  const wrongPm = await record(given(bid, "2026-10-14", DoseSlot.PM));
  await voidDose(wrongPm.doseId, "Recorded on the wrong animal");
  const everyThree = await orderFor(fostered, {
    frequency: MedicationFrequency.EVERY_N_DAYS,
    intervalDays: 3,
    firstSlot: DoseSlot.AM,
  });
  const onceADay = await orderFor(fostered, {
    frequency: MedicationFrequency.SID,
    firstSlot: DoseSlot.AM,
  });
  const asNeeded = await orderFor(unhoused, {
    frequency: MedicationFrequency.PRN,
    firstSlot: null,
    endDate: null,
  });
  const prnDose = await record({ ...given(asNeeded, "2026-10-14", null), result: MedicationDoseResult.REFUSED });
  // Given its AM, then discontinued from that day: the AM stays on the
  // sheet, the PM is no longer expected.
  const stoppedToday = await orderFor(unhoused, { firstSlot: DoseSlot.AM });
  const stoppedAm = await record(given(stoppedToday, "2026-10-14", DoseSlot.AM));
  await discontinueFrom(stoppedToday, "2026-10-14");
  // Left off: discontinued before the day, ended before it, voided with a
  // dose that day, and on an animal that left.
  const stoppedEarlier = await orderFor(unhoused, { firstSlot: DoseSlot.AM });
  await discontinueFrom(stoppedEarlier, "2026-10-13");
  await orderFor(unhoused, {
    frequency: MedicationFrequency.PRN,
    firstSlot: null,
    endDate: day("2026-10-13"),
  });
  const prnStopped = await orderFor(unhoused, {
    frequency: MedicationFrequency.PRN,
    firstSlot: null,
  });
  await discontinueFrom(prnStopped, "2026-10-13");
  await orderFor(unhoused, {
    frequency: MedicationFrequency.PRN,
    firstSlot: null,
    startDate: day("2026-10-15"),
  });
  const voided = await orderFor(unhoused, { firstSlot: DoseSlot.AM });
  await record(given(voided, "2026-10-14", DoseSlot.AM));
  await voidOrder(voided);
  await orderFor(left);
  await archive(left);

  const mine = new Set([housed, fostered, unhoused, left]);
  const sheet = (await findDoseSheet(prisma, SHEET_DAY)).filter((entry) =>
    mine.has(entry.animal.id),
  );
  assert.deepEqual(
    sheet
      .map((entry) => ({
        order: entry.order.id,
        slots: entry.slots,
        doses: entry.doses.map((dose) => dose.id),
        place: entry.place,
      }))
      .sort((a, b) => a.order.localeCompare(b.order)),
    [
      {
        order: bid,
        slots: [DoseSlot.AM, DoseSlot.PM],
        doses: [am.doseId],
        place: {
          type: "UNIT",
          locationId: location.id,
          locationName: location.name,
          unitId: unit.id,
          unitName: "MED-1",
        },
      },
      {
        order: onceADay,
        slots: [DoseSlot.AM],
        doses: [],
        place: { type: "FOSTER", fosterPersonId: fosterPerson.id, fosterName: fosterPerson.name },
      },
      { order: asNeeded, slots: [], doses: [prnDose.doseId], place: { type: "NOT_HOUSED" } },
      { order: stoppedToday, slots: [DoseSlot.AM], doses: [stoppedAm.doseId], place: { type: "NOT_HOUSED" } },
    ].sort((a, b) => a.order.localeCompare(b.order)),
  );
  // Every three days from the 12th falls on the 15th, not the 14th.
  assert.ok(!sheet.some((entry) => entry.order.id === everyThree));
  const housedEntry = sheet.find((entry) => entry.order.id === bid)!;
  assert.deepEqual(housedEntry.order, {
    id: bid,
    itemName: doxy(),
    doseAmount: 100,
    doseUnit: DoseUnit.MG,
    route: MedicalRoute.ORAL,
    frequency: MedicationFrequency.BID,
    intervalDays: null,
    instructions: null,
  });
  assert.equal(housedEntry.doses[0].administeredByName, `Doses staff ${runId}`);

  // Laid out on a clock past AM's end: the AM given, the PM still due.
  const sections = doseSheetSections(
    sheet,
    SHEET_DAY,
    { day: SHEET_DAY, time: "11:00" },
    DEFAULT_DOSE_SLOT_ENDS,
  );
  const states = sections.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.rows.map((row) => [section.key, group.title, row.order.id, row.state]),
    ),
  );
  assert.deepEqual(
    states.filter(([, , orderId]) => orderId === bid),
    [
      [DoseSlot.AM, location.name, bid, MedicationDoseResult.GIVEN],
      [DoseSlot.PM, location.name, bid, "DUE"],
    ],
  );
});

test("the queue's missed doses: yesterday and today, ended, with no live dose", async () => {
  const metronidazoleId = await newMedication("Metronidazole");
  const clock = { day: day("2026-10-15"), time: "15:00" };

  // AM and PM yesterday accounted for (given, refused); AM today missed;
  // PM today not ended yet. A three-times-a-day order from today's Midday:
  // its Midday has ended, missed.
  // The three-times-a-day order is ordered first, so the read meets its
  // Midday before the earlier AM.
  const both = await animalIn("Both");
  await orderFor(both, {
    itemId: metronidazoleId,
    frequency: MedicationFrequency.TID,
    firstSlot: DoseSlot.MIDDAY,
    startDate: day("2026-10-15"),
  });
  const bid = await orderFor(both, { firstSlot: DoseSlot.AM });
  await record(given(bid, "2026-10-14", DoseSlot.AM));
  await record({ ...given(bid, "2026-10-14", DoseSlot.PM), result: MedicationDoseResult.REFUSED });

  // Once a day since the 10th: the 13th is missed too, but before yesterday.
  const older = await animalIn("Older");
  await orderFor(older, {
    frequency: MedicationFrequency.SID,
    firstSlot: DoseSlot.AM,
    startDate: day("2026-10-10"),
  });

  // Discontinued from yesterday, voided, given a voided dose, and an animal
  // that left.
  const quiet = await animalIn("Quiet");
  const stopped = await orderFor(quiet, { firstSlot: DoseSlot.AM, startDate: day("2026-10-10") });
  await discontinueFrom(stopped, "2026-10-14");
  const voided = await orderFor(quiet, { firstSlot: DoseSlot.AM });
  await voidOrder(voided);
  const left = await animalIn("Left queue");
  await orderFor(left, { firstSlot: DoseSlot.AM });
  await archive(left);
  const voidedDose = await animalIn("Voided dose");
  const voidedDoseOrder = await orderFor(voidedDose, {
    frequency: MedicationFrequency.SID,
    firstSlot: DoseSlot.AM,
    startDate: day("2026-10-15"),
  });
  const { doseId } = await record(given(voidedDoseOrder, "2026-10-15", DoseSlot.AM));
  await voidDose(doseId, "Recorded for the wrong animal");

  const mine = new Set([both, older, quiet, left, voidedDose]);
  const rows = (await findMissedDosesForQueue(prisma, clock, DEFAULT_DOSE_SLOT_ENDS)).filter(
    (row) => mine.has(row.animal.id),
  );
  assert.deepEqual(
    rows.map((row) => ({
      animalId: row.animal.id,
      count: row.count,
      earliest: row.earliest,
      medications: row.medications,
    })),
    [
      {
        animalId: older,
        count: 2,
        earliest: { slotDate: "2026-10-14", slot: DoseSlot.AM },
        medications: [doxy()],
      },
      {
        animalId: both,
        count: 2,
        earliest: { slotDate: "2026-10-15", slot: DoseSlot.AM },
        medications: [doxy(), `Metronidazole ${runId}`],
      },
      {
        animalId: voidedDose,
        count: 1,
        earliest: { slotDate: "2026-10-15", slot: DoseSlot.AM },
        medications: [doxy()],
      },
    ],
  );
  assert.deepEqual(rows[0].animal, {
    id: older,
    name: `Older ${runId}`,
    species: `Doses species ${runId}`,
    currentUnit: null,
  });

  // At PM's end, today's PM is missed too.
  const atPmEnd = (
    await findMissedDosesForQueue(prisma, { ...clock, time: "20:00" }, DEFAULT_DOSE_SLOT_ENDS)
  ).find((row) => row.animal.id === both);
  assert.equal(atPmEnd?.count, 4);
});

test("an order voided after its doses keeps them, and no read counts them", async () => {
  const animalId = await animalIn("Voided after");
  const orderId = await orderFor(animalId, { firstSlot: DoseSlot.AM });
  await record(given(orderId, "2026-10-14", DoseSlot.AM));
  await record({ ...given(orderId, "2026-10-14", DoseSlot.PM), result: MedicationDoseResult.REFUSED });
  await voidOrder(orderId);

  assert.equal(await prisma.medicationDose.count({ where: { orderId, voidedAt: null } }), 2);
  assert.ok(
    !(await findDoseSheet(prisma, day("2026-10-14"))).some((entry) => entry.order.id === orderId),
  );
  assert.ok(
    !(
      await findMissedDosesForQueue(prisma, { day: TODAY, time: "23:00" }, DEFAULT_DOSE_SLOT_ENDS)
    ).some((row) => row.animal.id === animalId),
  );
  const [order] = (
    await findAnimalMedications(prisma, animalId, { fromDay: day("2026-10-12"), toDay: TODAY })
  ).orders;
  assert.equal(order.slotOrder.voided, true);
  assert.equal(order.doses.length, 2);
});

// ---------------------------------------------------------------------------
// Two transactions at once
// ---------------------------------------------------------------------------

const newDoseIn = (
  tx: TransactionClient,
  orderId: string,
  animalId: string,
  slotDate: string,
  slot: DoseSlot,
) =>
  tx.medicationDose.create({
    data: {
      orderId,
      animalId,
      slotDate,
      slot,
      result: MedicationDoseResult.GIVEN,
      administeredAt: new Date("2026-10-14T13:00:00Z"),
      administeredById: staffId,
      createdById: staffId,
    },
  });

const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;

// The proof that `waiterPid` reached the lock and is blocked there, by the
// holder or behind one of the holder's waiters (Postgres queues a row lock's
// later waiters behind its first).
const waitForBlockedBy = async (waiterPid: number, holderPid: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ blocked }] = await prisma.$queryRaw<{ blocked: boolean }[]>`
      SELECT ${holderPid}::int = ANY (pg_blocking_pids(${waiterPid}::int))
        OR EXISTS (
          SELECT 1 FROM unnest(pg_blocking_pids(${waiterPid}::int)) AS ahead(pid)
          WHERE ${holderPid}::int = ANY (pg_blocking_pids(ahead.pid))
        ) AS blocked`;
    if (blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Backend ${waiterPid} was never seen waiting on backend ${holderPid}.`);
};

// Sessions waiting on `holderPid`'s lock, directly or queued behind one that
// is.
const waitForSessionsQueuedBehind = async (holderPid: number, count: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      WITH direct AS (
        SELECT pid FROM pg_stat_activity
        WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))
      )
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE pid IN (SELECT pid FROM direct)
         OR pg_blocking_pids(pid) && ARRAY(SELECT pid FROM direct)`;
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Fewer than ${count} sessions were seen waiting on ${holderPid}.`);
};

const heldOpen = new Set<{ release: () => void; done: Promise<unknown> }>();

/** Runs `work` in a transaction kept open until released. */
const holdOpen = async <T>(work: (tx: TransactionClient) => Promise<T>) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: (value: T) => void;
  const isHeld = new Promise<T>((resolve) => (held = resolve));
  const done = prisma.$transaction(
    async (tx) => {
      held(await work(tx));
      await released;
    },
    { timeout: 20_000 },
  );
  const entry = { release, done };
  heldOpen.add(entry);
  void done.finally(() => heldOpen.delete(entry)).catch(() => {});
  const result = await Promise.race([isHeld, done as Promise<never>]);
  return { result, release, done };
};

afterEach(async () => {
  const open = [...heldOpen];
  for (const { release } of open) release();
  await Promise.allSettled(open.map(({ done }) => done));
});

/**
 * Runs `hold` in a transaction kept open, uncommitted, until `second` (in a
 * transaction of its own) is seen waiting on it; then lets it commit. Returns
 * once both have finished, rethrowing either's error.
 */
const overlap = async (
  hold: (tx: TransactionClient) => Promise<unknown>,
  second: (tx: TransactionClient) => Promise<unknown>,
) => {
  // Longer than the five seconds the wait may take, so a slow machine fails
  // on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: (pid: number) => void;
  const isHeld = new Promise<number>((resolve) => (held = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await hold(tx);
      held(await backendPid(tx));
      await released;
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isHeld, holder as Promise<never>]);
  let started!: (pid: number) => void;
  const isStarted = new Promise<number>((resolve) => (started = resolve));
  const later = prisma.$transaction(
    async (tx) => {
      started(await backendPid(tx));
      return second(tx);
    },
    { timeout },
  );
  void later.catch(() => {});
  try {
    // `later` settles first only when it threw before handing back its pid.
    // One that finishes without waiting is never seen blocked, and fails.
    const laterPid = await Promise.race([isStarted, later as Promise<never>]);
    await waitForBlockedBy(laterPid, holderPid);
  } finally {
    release();
    await Promise.allSettled([holder, later]);
  }
  await holder;
  await later;
};
