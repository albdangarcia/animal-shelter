// Medication orders, against a real Postgres: ordered, corrected,
// discontinued and voided through the order service, as the actions drive
// it. An order names a live medication for the animal's species, starts in
// its current stay, and keeps its medication, dose and frequency; a
// correction can't move it past the doses already recorded.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  DoseSlot,
  DoseUnit,
  IntakeType,
  MedicalItemKind,
  MedicalRoute,
  MedicationDoseResult,
  MedicationFrequency,
  MedicationOrderEventAction,
  Sex,
} from "@/prisma/generated/enums";
import {
  createMedicalItem,
  retireMedicalItem,
  updateMedicalItem,
} from "@/app/lib/services/medical-catalog";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import {
  createMedicationOrder,
  discontinueMedicationOrder,
  editMedicationOrder,
  voidMedicationOrder,
  type MedicationOrderCorrection,
  type MedicationOrderInput,
} from "@/app/lib/services/medication-order";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { ConflictError } from "@/app/lib/utils/errors";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up what
// carries its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-15");
const INTAKE_DAY = calendarDay("2026-09-01");
const day = calendarDay;
const { SID, BID, TID, EVERY_N_DAYS, PRN } = MedicationFrequency;

let speciesId: string;
let otherSpeciesId: string;
let colorId: string;
let staffId: string;
let editorId: string;
let doxycyclineId: string;
let otherSpeciesMedicationId: string;
let retiredMedicationId: string;
let vaccineId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  const species = async (label: string) =>
    (await prisma.species.create({ data: { name: name(label) }, select: { id: true } })).id;
  speciesId = await species("Orders species");
  otherSpeciesId = await species("Orders other species");
  colorId = (
    await prisma.color.create({ data: { name: name("Orders color") }, select: { id: true } })
  ).id;
  const person = async (label: string) =>
    (await prisma.person.create({ data: { name: name(label) }, select: { id: true } })).id;
  staffId = await person("Orders staff");
  editorId = await person("Orders editor");
  const item = (kind: MedicalItemKind, label: string, speciesIds: string[] = []) =>
    prisma.$transaction(async (tx) =>
      (await createMedicalItem(tx, { kind, name: name(label), speciesIds, analytes: [] })).id,
    );
  doxycyclineId = await item(MedicalItemKind.MEDICATION, "Doxycycline");
  otherSpeciesMedicationId = await item(MedicalItemKind.MEDICATION, "Pimobendan", [
    otherSpeciesId,
  ]);
  retiredMedicationId = await item(MedicalItemKind.MEDICATION, "Old stock");
  await prisma.$transaction((tx) => retireMedicalItem(tx, retiredMedicationId));
  vaccineId = await item(MedicalItemKind.VACCINE, "DHPP");
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the orders, their events and doses, and the activity rows.
  await prisma.animal.deleteMany({ where: { speciesId: { in: [speciesId, otherSpeciesId] } } });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, editorId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: { in: [speciesId, otherSpeciesId] } } });
  await prisma.$disconnect();
});

const makeAnimal = async (
  label: string,
  { intakeDays = [INTAKE_DAY], archived = false }: { intakeDays?: CalendarDay[]; archived?: boolean } = {},
) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: Sex.MALE,
        speciesId,
        primaryColorId: colorId,
        ...(archived && { listingStatus: AnimalListingStatus.ARCHIVED }),
        intake: {
          create: intakeDays.map((intakeDate) => ({
            type: IntakeType.STRAY,
            intakeDate,
            staffMemberId: staffId,
          })),
        },
      },
      select: { id: true },
    })
  ).id;

const orderOf = (
  animalId: string,
  overrides: Partial<MedicationOrderInput> = {},
): MedicationOrderInput => ({
  animalId,
  itemId: doxycyclineId,
  doseAmount: 100,
  doseUnit: DoseUnit.MG,
  route: MedicalRoute.ORAL,
  frequency: BID,
  startDate: day("2026-10-12"),
  firstSlot: DoseSlot.AM,
  endDate: day("2026-11-10"),
  ...overrides,
});

const create = (input: MedicationOrderInput) =>
  prisma.$transaction((tx) => createMedicationOrder(tx, input, staffId, TODAY));

const edit = (orderId: string, correction: MedicationOrderCorrection) =>
  prisma.$transaction((tx) => editMedicationOrder(tx, orderId, correction, editorId, TODAY));

const discontinue = (orderId: string, input: { day: CalendarDay; reason: string }) =>
  prisma.$transaction((tx) => discontinueMedicationOrder(tx, orderId, input, editorId, TODAY));

const voidIt = (orderId: string, reason: string) =>
  prisma.$transaction((tx) => voidMedicationOrder(tx, orderId, reason, editorId));

// The dose service writes doses in its own tests; here a dose only has to be
// there, live, on a day.
const recordDose = (orderId: string, animalId: string, slotDate: string, slot: DoseSlot) =>
  prisma.medicationDose.create({
    data: {
      orderId,
      animalId,
      slotDate,
      slot,
      result: MedicationDoseResult.GIVEN,
      administeredAt: new Date(`${slotDate}T13:00:00Z`),
      administeredById: staffId,
      createdById: staffId,
    },
    select: { id: true },
  });

const stored = (orderId: string) =>
  prisma.medicationOrder.findUniqueOrThrow({ where: { id: orderId } });

const eventsOf = (orderId: string) =>
  prisma.medicationOrderEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: { action: true, actorId: true, before: true, after: true },
  });

const feedOf = async (animalId: string, type?: AnimalActivityType) =>
  (
    await prisma.animalActivityLog.findMany({
      where: { animalId, ...(type ? { activityType: type } : {}) },
      orderBy: { changedAt: "asc" },
      select: { changeSummary: true },
    })
  ).map((row) => row.changeSummary);

/** Runs `write`, expecting it refused on `field` with nothing written. */
const assertRefused = async (
  animalId: string,
  write: () => Promise<unknown>,
  field: string | undefined,
  message?: RegExp,
) => {
  const ordersBefore = await prisma.medicationOrder.findMany({
    where: { animalId },
    orderBy: { id: "asc" },
  });
  const eventsBefore = await prisma.medicationOrderEvent.count({ where: { order: { animalId } } });
  const feedBefore = await prisma.animalActivityLog.count({ where: { animalId } });
  await assert.rejects(write, (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.field, field);
    if (message) assert.match(error.message, message);
    return true;
  });
  assert.deepEqual(
    await prisma.medicationOrder.findMany({ where: { animalId }, orderBy: { id: "asc" } }),
    ordersBefore,
  );
  assert.equal(
    await prisma.medicationOrderEvent.count({ where: { order: { animalId } } }),
    eventsBefore,
  );
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), feedBefore);
};

/** Runs `write`, expecting a conflict with nothing written. */
const assertConflict = async (
  animalId: string,
  write: () => Promise<unknown>,
  message: RegExp,
) => {
  const ordersBefore = await prisma.medicationOrder.findMany({
    where: { animalId },
    orderBy: { id: "asc" },
  });
  const feedBefore = await prisma.animalActivityLog.count({ where: { animalId } });
  await assert.rejects(write, (error: unknown) => {
    assert.ok(error instanceof ConflictError, String(error));
    assert.match(error.message, message);
    return true;
  });
  assert.deepEqual(
    await prisma.medicationOrder.findMany({ where: { animalId }, orderBy: { id: "asc" } }),
    ordersBefore,
  );
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), feedBefore);
};

const doxy = name("Doxycycline");

test("an order of each frequency: its row, its CREATED event and its feed row", async () => {
  const animalId = await makeAnimal("Each frequency");
  const cases: [Partial<MedicationOrderInput>, string][] = [
    [
      { frequency: SID, prescribedBy: "  Downtown Veterinary Clinic ", instructions: " With food. " },
      `${doxy} 100 mg oral, once a day, from Oct 12, 2026 to Nov 10, 2026, ordered.`,
    ],
    [
      { frequency: BID, firstSlot: DoseSlot.PM },
      `${doxy} 100 mg oral, twice a day, from Oct 12, 2026 to Nov 10, 2026, ordered.`,
    ],
    [
      { frequency: TID, firstSlot: DoseSlot.MIDDAY, endDate: null },
      `${doxy} 100 mg oral, three times a day, from Oct 12, 2026, ordered.`,
    ],
    [
      { frequency: EVERY_N_DAYS, intervalDays: 3, doseAmount: 1, doseUnit: DoseUnit.TABLET },
      `${doxy} 1 tablet oral, every 3 days, from Oct 12, 2026 to Nov 10, 2026, ordered.`,
    ],
    [
      { frequency: EVERY_N_DAYS, intervalDays: 7, doseAmount: 2, doseUnit: DoseUnit.TABLET },
      `${doxy} 2 tablets oral, weekly, from Oct 12, 2026 to Nov 10, 2026, ordered.`,
    ],
    [
      {
        frequency: PRN,
        firstSlot: null,
        route: MedicalRoute.SUBCUTANEOUS,
        doseUnit: DoseUnit.ML,
        doseAmount: 0.5,
        startDate: day("2026-10-20"),
        endDate: day("2026-10-20"),
      },
      `${doxy} 0.5 mL subcutaneous, as needed, on Oct 20, 2026, ordered.`,
    ],
  ];

  for (const [overrides, text] of cases) {
    const input = orderOf(animalId, overrides);
    const { orderId, animalId: returned } = await create(input);
    assert.equal(returned, animalId);

    const row = await stored(orderId);
    const values = {
      itemId: doxycyclineId,
      doseAmount: input.doseAmount,
      doseUnit: input.doseUnit,
      route: input.route,
      frequency: input.frequency,
      intervalDays: input.intervalDays ?? null,
      startDate: input.startDate,
      firstSlot: input.firstSlot ?? null,
      endDate: input.endDate ?? null,
      instructions: input.instructions ? input.instructions.trim() : null,
      prescribedBy: input.prescribedBy ? input.prescribedBy.trim() : null,
    };
    assert.deepEqual(
      {
        itemId: row.itemId,
        doseAmount: row.doseAmount,
        doseUnit: row.doseUnit,
        route: row.route,
        frequency: row.frequency,
        intervalDays: row.intervalDays,
        startDate: row.startDate,
        firstSlot: row.firstSlot,
        endDate: row.endDate,
        instructions: row.instructions,
        prescribedBy: row.prescribedBy,
      },
      values,
    );
    assert.equal(row.createdById, staffId);
    assert.equal(row.discontinuedDate, null);
    assert.equal(row.voidedAt, null);
    assert.deepEqual(await eventsOf(orderId), [
      { action: MedicationOrderEventAction.CREATED, actorId: staffId, before: null, after: values },
    ]);
    assert.equal((await feedOf(animalId, AnimalActivityType.MEDICATION_ORDERED)).at(-1), text);
  }
  assert.equal((await feedOf(animalId)).length, cases.length);
});

test("an order is refused for an animal that left, and for an item it can't name", async () => {
  const animalId = await makeAnimal("Refused items");
  const archivedId = await makeAnimal("Refused archived", { archived: true });

  await assertRefused(
    archivedId,
    () => create(orderOf(archivedId)),
    undefined,
    /has left the shelter's care, so no medication can be ordered/,
  );
  await assertRefused(
    animalId,
    () => create(orderOf(animalId, { itemId: retiredMedicationId })),
    "itemId",
    /has been retired from the catalog and can't be ordered\.$/,
  );
  await assertRefused(
    animalId,
    () => create(orderOf(animalId, { itemId: otherSpeciesMedicationId })),
    "itemId",
    /isn't for this animal's species\.$/,
  );
  await assertRefused(
    animalId,
    () => create(orderOf(animalId, { itemId: vaccineId })),
    "itemId",
    new RegExp(`^${name("DHPP")} is a vaccine, not a medication\\.$`),
  );
  await assertRefused(
    animalId,
    () => create(orderOf(animalId, { itemId: "cmnosuchitem000000000000" })),
    "itemId",
    /^That medication no longer exists\.$/,
  );
});

test("an order's dose, frequency, slot and days are checked", async () => {
  const animalId = await makeAnimal("Refused values");
  const refused = (
    overrides: Partial<MedicationOrderInput>,
    field: string,
    message: RegExp,
  ) => assertRefused(animalId, () => create(orderOf(animalId, overrides)), field, message);

  await refused({ doseAmount: 0 }, "doseAmount", /^The dose must be more than 0\.$/);
  await refused({ doseAmount: Number.NaN }, "doseAmount", /^The dose must be more than 0\.$/);
  await refused({ doseUnit: null as unknown as DoseUnit }, "doseUnit", /^Pick the dose's unit\.$/);
  await refused({ route: null as unknown as MedicalRoute }, "route", /^Pick the route\.$/);
  await refused(
    { intervalDays: 3 },
    "intervalDays",
    /^Only an order given every few days has days between doses\.$/,
  );
  await refused({ frequency: EVERY_N_DAYS }, "intervalDays", /^Give the days between doses\.$/);
  for (const intervalDays of [1, 32, 2.5]) {
    await refused(
      { frequency: EVERY_N_DAYS, intervalDays },
      "intervalDays",
      /^An order given every few days is given every 2 to 31 days\.$/,
    );
  }
  await refused(
    { frequency: BID, firstSlot: DoseSlot.MIDDAY },
    "firstSlot",
    /^An order given twice a day has no Midday dose\.$/,
  );
  await refused({ firstSlot: null }, "firstSlot", /^Pick the slot of the first dose\.$/);
  await refused(
    { frequency: PRN, firstSlot: DoseSlot.AM },
    "firstSlot",
    /^An as-needed order has no slots\.$/,
  );
  await refused(
    { startDate: day("2026-08-31") },
    "startDate",
    /^The start date can't be before the animal's intake on Sep 1, 2026\.$/,
  );
  await refused(
    { startDate: day("2031-10-16"), endDate: null },
    "startDate",
    /^The start date can't be more than 5 years from today\.$/,
  );
  await refused(
    { endDate: day("2026-10-11") },
    "endDate",
    /^The end date can't be before the start date\.$/,
  );
  await refused(
    { endDate: day("2031-10-16") },
    "endDate",
    /^The end date can't be more than 5 years from today\.$/,
  );
  await refused(
    { instructions: "x".repeat(1001) },
    "instructions",
    /^The instructions can't be longer than 1000 characters\.$/,
  );
  await refused(
    { prescribedBy: "x".repeat(121) },
    "prescribedBy",
    /^"Prescribed by" can't be longer than 120 characters\.$/,
  );

  // The bounds themselves are allowed: the intake day, five years ahead,
  // one day long, and every 2 and every 31 days.
  await create(orderOf(animalId, { startDate: INTAKE_DAY, endDate: INTAKE_DAY }));
  await create(orderOf(animalId, { startDate: day("2031-10-15"), endDate: day("2031-10-15") }));
  await create(orderOf(animalId, { frequency: EVERY_N_DAYS, intervalDays: 2 }));
  await create(orderOf(animalId, { frequency: EVERY_N_DAYS, intervalDays: 31 }));
});

test("a returned animal's order starts in its current stay", async () => {
  const animalId = await makeAnimal("Returned", {
    intakeDays: [day("2026-03-01"), day("2026-10-01")],
  });
  await assertRefused(
    animalId,
    () => create(orderOf(animalId, { startDate: day("2026-09-30") })),
    "startDate",
    /^The start date can't be before the animal's intake on Oct 1, 2026\.$/,
  );
  await create(orderOf(animalId, { startDate: day("2026-10-01") }));
});

test("an order from an earlier stay can still have its instructions and end corrected", async () => {
  const animalId = await makeAnimal("Earlier stay");
  const { orderId } = await create(orderOf(animalId));
  // The animal left and came back: its latest intake is after the order's
  // start, which a new order couldn't have.
  await prisma.intake.create({
    data: { animalId, type: IntakeType.STRAY, intakeDate: "2026-10-14", staffMemberId: staffId },
  });
  await edit(orderId, { instructions: "With food.", endDate: day("2026-10-25") });
  const row = await stored(orderId);
  assert.equal(row.instructions, "With food.");
  assert.equal(row.endDate, "2026-10-25");
  // Moving the start re-checks it against the latest intake.
  await assertRefused(
    animalId,
    () => edit(orderId, { startDate: day("2026-10-13") }),
    "startDate",
    /^The start date can't be before the animal's intake on Oct 14, 2026\.$/,
  );
});

test("a catalog change to the medication waits for an order being written, then sees it", async () => {
  const animalId = await makeAnimal("Item lock");
  const itemId = await prisma.$transaction(async (tx) =>
    (
      await createMedicalItem(tx, {
        kind: MedicalItemKind.MEDICATION,
        name: name("Locked medication"),
        speciesIds: [],
        analytes: [],
      })
    ).id,
  );
  await assert.rejects(
    overlap(
      (tx) => createMedicationOrder(tx, orderOf(animalId, { itemId }), staffId, TODAY),
      (tx) =>
        updateMedicalItem(tx, itemId, {
          kind: MedicalItemKind.TREATMENT,
          name: name("Locked medication"),
          speciesIds: [],
          analytes: [],
        }),
    ),
    (error: unknown) =>
      error instanceof ConflictError &&
      /has been ordered for animals, so it can't become a treatment/.test(error.message),
  );
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id: itemId } })).kind,
    MedicalItemKind.MEDICATION,
  );
});

test("a correction changes the instructions and the prescriber, with their event and words", async () => {
  const animalId = await makeAnimal("Corrected");
  const { orderId } = await create(orderOf(animalId, { prescribedBy: "Dr Patel" }));

  const result = await edit(orderId, {
    instructions: "  Give with food. ",
    prescribedBy: "Downtown Veterinary Clinic",
  });
  assert.equal(result.status, "edited");
  const changeSummary = `${doxy} 100 mg oral, twice a day, was corrected: the prescriber changed from Dr Patel to Downtown Veterinary Clinic and instructions were added.`;
  assert.deepEqual(result, { status: "edited", orderId, animalId, changeSummary });
  assert.equal((await stored(orderId)).instructions, "Give with food.");
  assert.deepEqual((await eventsOf(orderId)).at(-1), {
    action: MedicationOrderEventAction.EDITED,
    actorId: editorId,
    before: { prescribedBy: "Dr Patel", instructions: null },
    after: { prescribedBy: "Downtown Veterinary Clinic", instructions: "Give with food." },
  });
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.MEDICATION_ORDER_EDITED), [
    changeSummary,
  ]);

  // A left-out field keeps what is stored, `null` clears it, and the end day
  // can be set or cleared.
  await edit(orderId, { prescribedBy: null, instructions: "Give with a meal." });
  await edit(orderId, { endDate: null });
  await edit(orderId, { endDate: day("2026-10-20") });
  assert.deepEqual((await feedOf(animalId, AnimalActivityType.MEDICATION_ORDER_EDITED)).slice(1), [
    `${doxy} 100 mg oral, twice a day, was corrected: the prescriber was cleared (was Downtown Veterinary Clinic) and instructions were edited.`,
    `${doxy} 100 mg oral, twice a day, was corrected: the end date was cleared (was Nov 10, 2026).`,
    `${doxy} 100 mg oral, twice a day, was corrected: the end date was set to Oct 20, 2026.`,
  ]);
  const row = await stored(orderId);
  assert.equal(row.prescribedBy, null);
  assert.equal(row.instructions, "Give with a meal.");
  assert.equal(row.endDate, "2026-10-20");
});

test("a correction that changes nothing writes nothing", async () => {
  const animalId = await makeAnimal("Unchanged");
  const { orderId } = await create(orderOf(animalId, { instructions: "With food." }));
  const before = await stored(orderId);
  assert.deepEqual(
    await edit(orderId, {
      instructions: "  With food.  ",
      startDate: day("2026-10-12"),
      firstSlot: DoseSlot.AM,
      endDate: day("2026-11-10"),
    }),
    { status: "unchanged", orderId, animalId },
  );
  assert.deepEqual(await stored(orderId), before);
  assert.equal((await eventsOf(orderId)).length, 1);
  assert.equal((await feedOf(animalId)).length, 1);
});

test("the start day and first slot move only while no dose is recorded, and the end never before a dose", async () => {
  const animalId = await makeAnimal("Moved");
  const { orderId } = await create(orderOf(animalId));

  // No dose yet: the start and first slot move, checked as on ordering.
  await edit(orderId, { startDate: day("2026-10-13"), firstSlot: DoseSlot.PM });
  assert.equal(
    (await feedOf(animalId, AnimalActivityType.MEDICATION_ORDER_EDITED)).at(-1),
    `${doxy} 100 mg oral, twice a day, was corrected: the start date changed from Oct 12, 2026 to Oct 13, 2026 and the first slot changed from AM to PM.`,
  );
  await assertRefused(
    animalId,
    () => edit(orderId, { firstSlot: DoseSlot.MIDDAY }),
    "firstSlot",
    /^An order given twice a day has no Midday dose\.$/,
  );
  await assertRefused(
    animalId,
    () => edit(orderId, { startDate: day("2026-08-01") }),
    "startDate",
    /before the animal's intake on Sep 1, 2026/,
  );
  await assertRefused(
    animalId,
    () => edit(orderId, { startDate: day("2026-11-11") }),
    "endDate",
    /^The end date can't be before the start date\.$/,
  );

  const dose = await recordDose(orderId, animalId, "2026-10-14", DoseSlot.PM);
  await assertRefused(
    animalId,
    () => edit(orderId, { startDate: day("2026-10-12") }),
    "startDate",
    /^The start date can't change once a dose is recorded\. Discontinue the order and order it again instead\.$/,
  );
  await assertRefused(
    animalId,
    () => edit(orderId, { firstSlot: DoseSlot.AM }),
    "firstSlot",
    /^The first slot can't change once a dose is recorded\./,
  );
  await assertRefused(
    animalId,
    () => edit(orderId, { endDate: day("2026-10-13") }),
    "endDate",
    /^The end date can't be before Oct 14, 2026: a dose is recorded on that day\.$/,
  );
  // On the dose's day is fine.
  await edit(orderId, { endDate: day("2026-10-14") });

  // A voided dose counts for nothing: the start moves again.
  await prisma.medicationDose.update({
    where: { id: dose.id },
    data: { voidedAt: new Date(), voidedById: editorId, voidReason: "Wrong order" },
  });
  await edit(orderId, { endDate: day("2026-10-13"), startDate: day("2026-10-12") });
  assert.equal((await stored(orderId)).startDate, "2026-10-12");
});

test("a voided or discontinued order isn't corrected", async () => {
  const animalId = await makeAnimal("Not corrected");
  const voided = await create(orderOf(animalId));
  await voidIt(voided.orderId, "Wrong animal");
  await assertConflict(
    animalId,
    () => edit(voided.orderId, { instructions: "With food." }),
    /^This order was voided, so it can't be edited\.$/,
  );
  const discontinued = await create(orderOf(animalId));
  await discontinue(discontinued.orderId, { day: TODAY, reason: "Course changed" });
  await assertConflict(
    animalId,
    () => edit(discontinued.orderId, { endDate: day("2026-10-20") }),
    /^This order was discontinued, so it can't be edited\. Order it again instead\.$/,
  );
});

test("discontinuing: from today or an earlier day, never before a dose, the start or after today", async () => {
  const animalId = await makeAnimal("Discontinued");

  const today = await create(orderOf(animalId));
  await discontinue(today.orderId, { day: TODAY, reason: "  Stools normal again. " });
  const row = await stored(today.orderId);
  assert.equal(row.discontinuedDate, "2026-10-15");
  assert.equal(row.discontinueReason, "Stools normal again.");
  assert.equal(row.discontinuedById, editorId);
  assert.deepEqual((await eventsOf(today.orderId)).at(-1), {
    action: MedicationOrderEventAction.DISCONTINUED,
    actorId: editorId,
    before: { discontinuedDate: null },
    after: { discontinuedDate: "2026-10-15", discontinueReason: "Stools normal again." },
  });
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.MEDICATION_DISCONTINUED), [
    `${doxy} 100 mg oral, twice a day, discontinued from Oct 15, 2026. Reason: Stools normal again.`,
  ]);
  await assertConflict(
    animalId,
    () => discontinue(today.orderId, { day: TODAY, reason: "Again" }),
    /^This order was already discontinued from Oct 15, 2026\.$/,
  );

  const earlier = await create(orderOf(animalId));
  await recordDose(earlier.orderId, animalId, "2026-10-13", DoseSlot.AM);
  await assertRefused(
    animalId,
    () => discontinue(earlier.orderId, { day: day("2026-10-12"), reason: "Course changed" }),
    "day",
    /^The order can't be discontinued before Oct 13, 2026: a dose is recorded on that day\.$/,
  );
  await assertRefused(
    animalId,
    () => discontinue(earlier.orderId, { day: day("2026-10-11"), reason: "Course changed" }),
    "day",
    /^The order can't be discontinued before it started on Oct 12, 2026\.$/,
  );
  await assertRefused(
    animalId,
    () => discontinue(earlier.orderId, { day: day("2026-10-16"), reason: "Course changed" }),
    "day",
    /^The discontinue date can't be in the future\.$/,
  );
  await assertRefused(
    animalId,
    () => discontinue(earlier.orderId, { day: TODAY, reason: "  " }),
    "reason",
    /^Say why the order is being discontinued\.$/,
  );
  await assertRefused(
    animalId,
    () => discontinue(earlier.orderId, { day: TODAY, reason: "x".repeat(1001) }),
    "reason",
    /^The reason can't be longer than 1000 characters\.$/,
  );
  // On the dose's own day: the dose stays.
  await discontinue(earlier.orderId, { day: day("2026-10-13"), reason: "Course changed" });
  assert.equal((await stored(earlier.orderId)).discontinuedDate, "2026-10-13");
  assert.equal(
    await prisma.medicationDose.count({ where: { orderId: earlier.orderId, voidedAt: null } }),
    1,
  );
});

test("an order that hasn't started is discontinued from today; one already over can't be", async () => {
  const animalId = await makeAnimal("Not started");
  const upcoming = await create(
    orderOf(animalId, { startDate: day("2026-10-20"), endDate: day("2026-10-30") }),
  );
  for (const refusedDay of [day("2026-10-14"), day("2026-10-20")]) {
    await assertRefused(
      animalId,
      () => discontinue(upcoming.orderId, { day: refusedDay, reason: "Not needed" }),
      "day",
      refusedDay > TODAY
        ? /^The discontinue date can't be in the future\.$/
        : /^This order hasn't started yet, so it is discontinued from today\.$/,
    );
  }
  await discontinue(upcoming.orderId, { day: TODAY, reason: "Not needed" });
  assert.equal((await stored(upcoming.orderId)).discontinuedDate, "2026-10-15");

  const over = await create(
    orderOf(animalId, { startDate: day("2026-10-01"), endDate: day("2026-10-10") }),
  );
  await assertRefused(
    animalId,
    () => discontinue(over.orderId, { day: day("2026-10-11"), reason: "Course changed" }),
    "day",
    /^This order ended on Oct 10, 2026, before Oct 11, 2026, so there is nothing left to discontinue\.$/,
  );
  // From its last day, it still had that day to run.
  await discontinue(over.orderId, { day: day("2026-10-10"), reason: "Course changed" });
});

test("a void is written once, and keeps the order and its doses", async () => {
  const animalId = await makeAnimal("Voided");
  const { orderId } = await create(orderOf(animalId));
  await recordDose(orderId, animalId, "2026-10-12", DoseSlot.AM);

  await assertRefused(
    animalId,
    () => voidIt(orderId, "  "),
    "reason",
    /^A reason for voiding this order is required\.$/,
  );
  await voidIt(orderId, " Wrong dose: the vet ordered 100 mg ");
  const row = await stored(orderId);
  assert.ok(row.voidedAt);
  assert.equal(row.voidedById, editorId);
  assert.equal(row.voidReason, "Wrong dose: the vet ordered 100 mg");
  assert.deepEqual((await eventsOf(orderId)).at(-1), {
    action: MedicationOrderEventAction.VOIDED,
    actorId: editorId,
    before: null,
    after: { voidReason: "Wrong dose: the vet ordered 100 mg" },
  });
  assert.deepEqual(await feedOf(animalId, AnimalActivityType.MEDICATION_ORDER_VOIDED), [
    `${doxy} 100 mg oral, twice a day, from Oct 12, 2026 to Nov 10, 2026, was voided. Reason: Wrong dose: the vet ordered 100 mg`,
  ]);
  assert.equal(await prisma.medicationDose.count({ where: { orderId } }), 1);

  await assertConflict(
    animalId,
    () => voidIt(orderId, "Again"),
    /^This order has already been voided\. A void can't be undone/,
  );
  await assertConflict(
    animalId,
    () => discontinue(orderId, { day: TODAY, reason: "Course changed" }),
    /^This order was voided, so it can't be discontinued\.$/,
  );
});

test("an animal that left can still have its order corrected, discontinued and voided", async () => {
  const animalId = await makeAnimal("Left later");
  const first = await create(orderOf(animalId));
  const second = await create(orderOf(animalId));
  await prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });
  await edit(first.orderId, { instructions: "With food." });
  await discontinue(first.orderId, { day: TODAY, reason: "Left the shelter" });
  await voidIt(second.orderId, "Recorded on the wrong animal");
});

test("a correction made while a dose is being written waits for it, then sees it", async () => {
  const animalId = await makeAnimal("At once");
  const { orderId } = await create(orderOf(animalId));

  // Stands in for a dose being recorded: the dose service takes the animal's
  // lock, then writes. The correction moving the start waits behind it, and
  // then finds the dose.
  await assert.rejects(
    overlap(
      async (tx) => {
        await lockAnimal(tx, animalId);
        await tx.medicationDose.create({
          data: {
            orderId,
            animalId,
            slotDate: "2026-10-12",
            slot: DoseSlot.AM,
            result: MedicationDoseResult.GIVEN,
            administeredAt: new Date("2026-10-12T13:00:00Z"),
            administeredById: staffId,
            createdById: staffId,
          },
        });
      },
      (tx) => editMedicationOrder(tx, orderId, { startDate: day("2026-10-13") }, editorId, TODAY),
    ),
    (error: unknown) =>
      error instanceof MedicalEntryRefusal &&
      error.field === "startDate" &&
      /can't change once a dose is recorded/.test(error.message),
  );
  assert.equal((await stored(orderId)).startDate, "2026-10-12");
});

// ---------------------------------------------------------------------------
// Two transactions at once
// ---------------------------------------------------------------------------

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
  // Observed as soon as it starts, so a failed wait is not followed by an
  // unhandled rejection. Awaiting it below still sees any rejection.
  void later.catch(() => {});
  try {
    const laterPid = await Promise.race([isStarted, later as Promise<never>]);
    await waitForBlockedBy(laterPid, holderPid);
  } finally {
    release();
    await Promise.allSettled([holder, later]);
  }
  await holder;
  await later;
};
