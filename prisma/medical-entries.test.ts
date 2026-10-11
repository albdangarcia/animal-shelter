// Recording, correcting and voiding medical entries, against a real Postgres.
// An entry is only as good as what the rows say afterwards (the entry, its
// details, its events and the animal's activity), and the animal lock that
// serialises writes only exists there.
//
// `medical-entry.ts` is the whole of each entry action bar the session check
// and the cache invalidation, so driving it is driving the actions.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  DoseUnit,
  IntakeType,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  MedicalItemKind,
  MedicalRoute,
  PartnerType,
  Sex,
  TestResult,
} from "@/prisma/generated/enums";
import {
  MedicalEntryRefusal,
  editMedicalEntry,
  recordMedicalEntry,
  voidMedicalEntry,
  type MedicalEntryInput,
  type TestEntryInput,
  type TreatmentEntryInput,
  type VaccineEntryInput,
} from "@/app/lib/services/medical-entry";
import {
  createMedicalItem,
  retireMedicalItem,
  updateMedicalItem,
  type MedicalItemInput,
} from "@/app/lib/services/medical-catalog";
import { findLatestRabiesVaccine } from "@/app/lib/data/animals/medical-entry";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";

// Random, not the time: the files run in parallel, and each cleans up the
// catalog items whose names end in its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;

let dogId: string;
let catId: string;
let colorId: string;
let staffId: string;
let editorId: string;
let vetClinicId: string;
let closedClinicId: string;
let rescueId: string;

// Catalog items, by role.
let rabiesId: string;
let dhppId: string;
let catVaccineId: string;
let retiredVaccineId: string;
let comboTestId: string;
let otherTestId: string;
let dewormerId: string;
let bareTreatmentId: string;
const analyteIds: Record<string, string> = {};

const createItem = async (input: MedicalItemInput) =>
  (await prisma.$transaction((tx) => createMedicalItem(tx, input))).id;

before(async () => {
  const species = async (label: string) =>
    (
      await prisma.species.create({
        data: { name: `Entries ${label} ${runId}` },
        select: { id: true },
      })
    ).id;
  const person = async (name: string) =>
    (
      await prisma.person.create({
        data: { name: `${name} ${runId}` },
        select: { id: true },
      })
    ).id;
  const partner = async (name: string, type: PartnerType, isActive = true) =>
    (
      await prisma.partner.create({
        data: { name: `${name} ${runId}`, type, isActive },
        select: { id: true },
      })
    ).id;

  dogId = await species("dog");
  catId = await species("cat");
  colorId = (
    await prisma.color.create({
      data: { name: `Entries color ${runId}` },
      select: { id: true },
    })
  ).id;
  staffId = await person("Entries staff");
  editorId = await person("Entries editor");
  vetClinicId = await partner("Entries vet clinic", PartnerType.VET_CLINIC);
  closedClinicId = await partner(
    "Entries closed clinic",
    PartnerType.VET_CLINIC,
    false,
  );
  rescueId = await partner("Entries rescue", PartnerType.RESCUE_GROUP);

  const name = (label: string) => `${label} ${runId}`;
  rabiesId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("Rabies"),
    speciesIds: [dogId, catId],
    isRabies: true,
    defaultRoute: MedicalRoute.SUBCUTANEOUS,
    analytes: [],
  });
  dhppId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("DHPP"),
    manufacturer: "Generic Biologics",
    speciesIds: [dogId],
    defaultRoute: MedicalRoute.SUBCUTANEOUS,
    analytes: [],
  });
  catVaccineId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("FVRCP"),
    speciesIds: [catId],
    analytes: [],
  });
  retiredVaccineId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: name("Old stock"),
    speciesIds: [],
    analytes: [],
  });
  await prisma.$transaction((tx) => retireMedicalItem(tx, retiredVaccineId));
  comboTestId = await createItem({
    kind: MedicalItemKind.TEST,
    name: name("Combo"),
    speciesIds: [],
    analytes: [{ name: "Antigen" }, { name: "Antibody" }],
  });
  otherTestId = await createItem({
    kind: MedicalItemKind.TEST,
    name: name("Fecal"),
    speciesIds: [],
    analytes: [{ name: "Parasites" }],
  });
  dewormerId = await createItem({
    kind: MedicalItemKind.TREATMENT,
    name: name("Dewormer"),
    speciesIds: [],
    defaultRoute: MedicalRoute.ORAL,
    defaultDoseAmount: 2.5,
    defaultDoseUnit: DoseUnit.ML,
    analytes: [],
  });
  bareTreatmentId = await createItem({
    kind: MedicalItemKind.TREATMENT,
    name: name("Bare"),
    speciesIds: [],
    analytes: [],
  });
  for (const analyte of await prisma.medicalItemAnalyte.findMany({
    where: { itemId: { in: [comboTestId, otherTestId] } },
    select: { id: true, name: true },
  })) {
    analyteIds[analyte.name] = analyte.id;
  }
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, their details, events and activity rows with it.
  await prisma.animal.deleteMany({
    where: { speciesId: { in: [dogId, catId] } },
  });
  await prisma.medicalItem.deleteMany({
    where: { name: { endsWith: runId } },
  });
  await prisma.partner.deleteMany({
    where: { id: { in: [vetClinicId, closedClinicId, rescueId] } },
  });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, editorId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: { in: [dogId, catId] } } });
  await prisma.$disconnect();
});

const makeAnimal = async (
  label: string,
  speciesId = dogId,
  intakeDays: CalendarDay[] = [INTAKE_DAY],
) =>
  (
    await prisma.animal.create({
      data: {
        name: `${label} ${runId}`,
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
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

const vaccine = (overrides: Partial<VaccineEntryInput> = {}): VaccineEntryInput => ({
  kind: MedicalEntryKind.VACCINE,
  itemId: dhppId,
  completedDate: day("2026-09-01"),
  source: MedicalEntrySource.IN_HOUSE,
  ...overrides,
});

const rabies = (overrides: Partial<VaccineEntryInput> = {}) =>
  vaccine({ itemId: rabiesId, durationMonths: 12, ...overrides });

const comboTest = (overrides: Partial<TestEntryInput> = {}): TestEntryInput => ({
  kind: MedicalEntryKind.TEST,
  itemId: comboTestId,
  completedDate: day("2026-09-01"),
  source: MedicalEntrySource.IN_HOUSE,
  results: [
    { analyteId: analyteIds.Antigen, result: TestResult.NEGATIVE },
    { analyteId: analyteIds.Antibody, result: TestResult.NEGATIVE },
  ],
  ...overrides,
});

const treatment = (
  overrides: Partial<TreatmentEntryInput> = {},
): TreatmentEntryInput => ({
  kind: MedicalEntryKind.TREATMENT,
  itemId: dewormerId,
  completedDate: day("2026-09-01"),
  source: MedicalEntrySource.IN_HOUSE,
  ...overrides,
});

const record = (
  animalId: string,
  input: MedicalEntryInput,
  actorId = staffId,
  today = TODAY,
) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(tx, { ...input, animalId }, actorId, today),
  );

const edit = (
  entryId: string,
  input: MedicalEntryInput,
  actorId = editorId,
  options?: { timeout: number },
) =>
  prisma.$transaction(
    (tx) => editMedicalEntry(tx, entryId, input, actorId, TODAY),
    options,
  );

const voidEntry = (entryId: string, reason: string, actorId = editorId) =>
  prisma.$transaction((tx) => voidMedicalEntry(tx, entryId, reason, actorId));

const readEntry = (entryId: string) =>
  prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: {
      vaccine: true,
      test: { include: { results: { orderBy: { analyteName: "asc" } } } },
      treatment: true,
    },
  });

const eventsOf = (entryId: string) =>
  prisma.medicalEntryEvent.findMany({
    where: { entryId },
    orderBy: { createdAt: "asc" },
  });

const activityOf = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: {
      animalId,
      activityType: {
        in: [
          AnimalActivityType.MEDICAL_ENTRY_RECORDED,
          AnimalActivityType.MEDICAL_ENTRY_EDITED,
          AnimalActivityType.MEDICAL_ENTRY_VOIDED,
        ],
      },
    },
    orderBy: { changedAt: "asc" },
    select: { activityType: true, changedById: true, changeSummary: true },
  });

/** Rejects with a refusal on `field`. */
const refusedOn = async (promise: Promise<unknown>, field: string) => {
  await assert.rejects(promise, (error: Error) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.equal(error.field, field, error.message);
    return true;
  });
};

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

test("a vaccine is recorded with the item's defaults, a CREATED event and an activity row", async () => {
  const animalId = await makeAnimal("Vaccine");
  const { entryId } = await record(animalId, vaccine({ lotNumber: " A123 " }));

  const entry = await readEntry(entryId);
  assert.equal(entry.status, MedicalEntryStatus.COMPLETED);
  assert.equal(entry.kind, MedicalEntryKind.VACCINE);
  assert.equal(entry.createdById, staffId);
  // In-house care defaults to the person recording it.
  assert.equal(entry.administeredById, staffId);
  assert.equal(entry.vaccine?.manufacturer, "Generic Biologics");
  assert.equal(entry.vaccine?.route, MedicalRoute.SUBCUTANEOUS);
  assert.equal(entry.vaccine?.lotNumber, "A123");
  assert.equal(entry.vaccine?.validUntilDate, null);

  const [event] = await eventsOf(entryId);
  assert.equal(event.action, MedicalEntryEventAction.CREATED);
  assert.equal(event.actorId, staffId);
  assert.equal(event.before, null);
  assert.deepEqual(event.after, {
    kind: "VACCINE",
    status: "COMPLETED",
    itemId: dhppId,
    completedDate: "2026-09-01",
    source: "IN_HOUSE",
    vetPartnerId: null,
    vetName: null,
    administeredById: staffId,
    notes: null,
    manufacturer: "Generic Biologics",
    lotNumber: "A123",
    lotExpiryDate: null,
    route: "SUBCUTANEOUS",
    site: null,
    rabiesTagNumber: null,
    durationMonths: null,
    validUntilDate: null,
  });

  assert.deepEqual(await activityOf(animalId), [
    {
      activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
      changedById: staffId,
      changeSummary: `DHPP ${runId} vaccine recorded: given in house, on Sep 1, 2026.`,
    },
  ]);
});

test("a test is recorded with one result per analyte, names frozen", async () => {
  const animalId = await makeAnimal("Test", catId);
  const { entryId } = await record(
    animalId,
    comboTest({
      source: MedicalEntrySource.OUTSIDE_VET,
      vetPartnerId: vetClinicId,
      results: [
        { analyteId: analyteIds.Antigen, result: TestResult.NEGATIVE },
        { analyteId: analyteIds.Antibody, result: TestResult.POSITIVE },
      ],
    }),
  );

  const entry = await readEntry(entryId);
  assert.equal(entry.vetPartnerId, vetClinicId);
  // Outside care names nobody unless told.
  assert.equal(entry.administeredById, null);
  assert.deepEqual(
    entry.test?.results.map(({ analyteName, result }) => [analyteName, result]),
    [
      ["Antibody", TestResult.POSITIVE],
      ["Antigen", TestResult.NEGATIVE],
    ],
  );
  const [event] = await eventsOf(entryId);
  assert.deepEqual((event.after as { results: unknown }).results, [
    { analyteId: analyteIds.Antigen, analyteName: "Antigen", result: "NEGATIVE" },
    { analyteId: analyteIds.Antibody, analyteName: "Antibody", result: "POSITIVE" },
  ]);
  const [row] = await activityOf(animalId);
  assert.equal(
    row.changeSummary,
    `Combo ${runId} test recorded: run by an outside vet at Entries vet clinic ${runId}, on Sep 1, 2026. Results: Antigen negative, Antibody positive.`,
  );
});

test("a treatment takes the item's dose and route when left blank, and keeps what was given", async () => {
  const animalId = await makeAnimal("Treatment");
  const defaulted = await readEntry((await record(animalId, treatment())).entryId);
  assert.equal(defaulted.treatment?.doseAmount, 2.5);
  assert.equal(defaulted.treatment?.doseUnit, DoseUnit.ML);
  assert.equal(defaulted.treatment?.route, MedicalRoute.ORAL);

  const given = await readEntry(
    (
      await record(
        animalId,
        treatment({ doseAmount: 4, route: MedicalRoute.TOPICAL }),
      )
    ).entryId,
  );
  assert.equal(given.treatment?.doseAmount, 4);
  assert.equal(given.treatment?.doseUnit, DoseUnit.ML);
  assert.equal(given.treatment?.route, MedicalRoute.TOPICAL);
});

test("changing an item's defaults later leaves recorded entries alone", async () => {
  const animalId = await makeAnimal("Defaults");
  const itemId = await createItem({
    kind: MedicalItemKind.TREATMENT,
    name: `Changing ${runId}`,
    speciesIds: [],
    defaultRoute: MedicalRoute.ORAL,
    defaultDoseAmount: 1,
    defaultDoseUnit: DoseUnit.TABLET,
    analytes: [],
  });
  const { entryId } = await record(animalId, treatment({ itemId }));
  await prisma.$transaction((tx) =>
    updateMedicalItem(tx, itemId, {
      kind: MedicalItemKind.TREATMENT,
      name: `Changing ${runId}`,
      speciesIds: [],
      defaultRoute: MedicalRoute.TOPICAL,
      defaultDoseAmount: 2,
      defaultDoseUnit: DoseUnit.APPLICATION,
      analytes: [],
    }),
  );
  const entry = await readEntry(entryId);
  assert.equal(entry.treatment?.doseAmount, 1);
  assert.equal(entry.treatment?.doseUnit, DoseUnit.TABLET);
  assert.equal(entry.treatment?.route, MedicalRoute.ORAL);
});

// ---------------------------------------------------------------------------
// The shared rules
// ---------------------------------------------------------------------------

test("the item must be of the entry's kind, live, and for the animal's species", async () => {
  const animalId = await makeAnimal("Item rules");
  await refusedOn(record(animalId, vaccine({ itemId: dewormerId })), "itemId");
  await refusedOn(record(animalId, vaccine({ itemId: retiredVaccineId })), "itemId");
  await refusedOn(record(animalId, vaccine({ itemId: catVaccineId })), "itemId");
  await refusedOn(record(animalId, vaccine({ itemId: "missing" })), "itemId");
  assert.deepEqual(await activityOf(animalId), []);
});

test("the date given can't be in the future, and is required unless before intake", async () => {
  const animalId = await makeAnimal("Day rules");
  await refusedOn(
    record(animalId, vaccine({ completedDate: day("2026-10-11") })),
    "completedDate",
  );
  await record(animalId, vaccine({ completedDate: TODAY }));

  for (const source of [
    MedicalEntrySource.IN_HOUSE,
    MedicalEntrySource.OUTSIDE_VET,
  ]) {
    await refusedOn(
      record(animalId, vaccine({ source, completedDate: null })),
      "completedDate",
    );
  }
  const { entryId } = await record(
    animalId,
    vaccine({ source: MedicalEntrySource.BEFORE_INTAKE, completedDate: null }),
  );
  assert.equal((await readEntry(entryId)).completedDate, null);
});

test("care in the shelter's keeping is dated on or after the first intake", async () => {
  const animalId = await makeAnimal("Intake rules", dogId, [
    INTAKE_DAY,
    day("2026-09-15"),
  ]);
  for (const source of [
    MedicalEntrySource.IN_HOUSE,
    MedicalEntrySource.OUTSIDE_VET,
  ]) {
    await refusedOn(
      record(animalId, vaccine({ source, completedDate: day("2026-07-31") })),
      "completedDate",
    );
  }
  await record(animalId, vaccine({ completedDate: INTAKE_DAY }));
});

test("care before intake is dated no later than the latest intake", async () => {
  const animalId = await makeAnimal("Before intake", dogId, [
    INTAKE_DAY,
    day("2026-09-15"),
  ]);
  const before = (completedDate: CalendarDay) =>
    vaccine({ source: MedicalEntrySource.BEFORE_INTAKE, completedDate });
  await refusedOn(record(animalId, before(day("2026-09-16"))), "completedDate");
  await record(animalId, before(day("2026-09-15")));
  await record(animalId, before(day("2025-06-01")));
});

test("the vet clinic is an active vet clinic partner, and only for care outside", async () => {
  const animalId = await makeAnimal("Vet rules");
  const outside = (overrides: Partial<VaccineEntryInput>) =>
    vaccine({ source: MedicalEntrySource.OUTSIDE_VET, ...overrides });

  await refusedOn(record(animalId, outside({ vetPartnerId: rescueId })), "vetPartnerId");
  await refusedOn(
    record(animalId, outside({ vetPartnerId: closedClinicId })),
    "vetPartnerId",
  );
  await refusedOn(
    record(animalId, vaccine({ vetPartnerId: vetClinicId })),
    "vetPartnerId",
  );
  await refusedOn(record(animalId, vaccine({ vetName: "Dr. Ruiz" })), "vetName");

  const { entryId } = await record(
    animalId,
    outside({
      vetPartnerId: vetClinicId,
      vetName: " Dr. Ruiz ",
      administeredById: editorId,
    }),
  );
  const entry = await readEntry(entryId);
  assert.equal(entry.vetName, "Dr. Ruiz");
  assert.equal(entry.administeredById, editorId);
});

test("a rabies vaccine needs a duration of 1 to 36 months; nothing else takes one", async () => {
  const animalId = await makeAnimal("Rabies rules");
  await refusedOn(
    record(animalId, rabies({ durationMonths: null })),
    "durationMonths",
  );
  await refusedOn(record(animalId, rabies({ durationMonths: 0 })), "durationMonths");
  await refusedOn(record(animalId, rabies({ durationMonths: 37 })), "durationMonths");
  await refusedOn(record(animalId, rabies({ durationMonths: 1.5 })), "durationMonths");
  await refusedOn(
    record(animalId, vaccine({ rabiesTagNumber: "T-1" })),
    "rabiesTagNumber",
  );
  await refusedOn(record(animalId, vaccine({ durationMonths: 12 })), "durationMonths");
  await record(animalId, rabies({ durationMonths: 36, rabiesTagNumber: "T-1" }));
});

test("a test needs exactly one result for each of its analytes", async () => {
  const animalId = await makeAnimal("Test rules");
  await refusedOn(
    record(
      animalId,
      comboTest({
        results: [{ analyteId: analyteIds.Antigen, result: TestResult.NEGATIVE }],
      }),
    ),
    "results",
  );
  await refusedOn(
    record(
      animalId,
      comboTest({
        results: [
          { analyteId: analyteIds.Antigen, result: TestResult.NEGATIVE },
          { analyteId: analyteIds.Antibody, result: TestResult.NEGATIVE },
          { analyteId: analyteIds.Parasites, result: TestResult.NEGATIVE },
        ],
      }),
    ),
    "results",
  );
  await refusedOn(
    record(
      animalId,
      comboTest({
        results: [
          { analyteId: analyteIds.Antigen, result: TestResult.NEGATIVE },
          { analyteId: analyteIds.Antigen, result: TestResult.POSITIVE },
          { analyteId: analyteIds.Antibody, result: TestResult.NEGATIVE },
        ],
      }),
    ),
    "results",
  );
});

test("a treatment's dose is more than zero, and has a unit", async () => {
  const animalId = await makeAnimal("Dose rules");
  await refusedOn(record(animalId, treatment({ doseAmount: 0 })), "doseAmount");
  await refusedOn(
    record(animalId, treatment({ itemId: bareTreatmentId, doseAmount: 2 })),
    "doseUnit",
  );
  const { entryId } = await record(
    animalId,
    treatment({ itemId: bareTreatmentId }),
  );
  assert.equal((await readEntry(entryId)).treatment?.doseAmount, null);
});

// ---------------------------------------------------------------------------
// Rabies valid-until
// ---------------------------------------------------------------------------

test("rabies valid-until is derived, follows the date and duration, and is null for an unknown date", async () => {
  const animalId = await makeAnimal("Valid until");
  const input = rabies({ completedDate: day("2026-08-31"), durationMonths: 12 });
  const { entryId } = await record(animalId, input);
  const validUntil = async () => (await readEntry(entryId)).vaccine?.validUntilDate;
  assert.equal(await validUntil(), "2027-08-31");

  await edit(entryId, { ...input, durationMonths: 6 });
  // Feb 2027 has 28 days.
  assert.equal(await validUntil(), "2027-02-28");

  await edit(entryId, { ...input, durationMonths: 6, completedDate: day("2026-09-10") });
  assert.equal(await validUntil(), "2027-03-10");

  await edit(entryId, {
    ...input,
    durationMonths: 6,
    source: MedicalEntrySource.BEFORE_INTAKE,
    completedDate: null,
  });
  assert.equal(await validUntil(), null);
});

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

test("an edit records before and after for only the fields that changed", async () => {
  const animalId = await makeAnimal("Edit");
  const input = vaccine({ lotNumber: "A123", site: "Right shoulder" });
  const { entryId } = await record(animalId, input);

  const result = await edit(entryId, { ...input, lotNumber: "B456" });
  assert.equal(result.status, "edited");

  const events = await eventsOf(entryId);
  assert.equal(events.length, 2);
  const edited = events[1];
  assert.equal(edited.action, MedicalEntryEventAction.EDITED);
  assert.equal(edited.actorId, editorId);
  assert.deepEqual(edited.before, { lotNumber: "A123" });
  assert.deepEqual(edited.after, { lotNumber: "B456" });

  const rows = await activityOf(animalId);
  assert.deepEqual(rows[1], {
    activityType: AnimalActivityType.MEDICAL_ENTRY_EDITED,
    changedById: editorId,
    changeSummary: `DHPP ${runId} vaccine was corrected: the lot number changed from A123 to B456.`,
  });
  // The person who gave it is not the editor.
  assert.equal((await readEntry(entryId)).administeredById, staffId);
});

test("an edit's summary names every change and what it held before", async () => {
  const animalId = await makeAnimal("Edit summary");
  const input = vaccine({ notes: "Calm." });
  const { entryId } = await record(animalId, input);

  const result = await edit(entryId, {
    ...input,
    completedDate: day("2026-09-02"),
    source: MedicalEntrySource.OUTSIDE_VET,
    vetPartnerId: vetClinicId,
    route: MedicalRoute.INTRAMUSCULAR,
    manufacturer: null,
    notes: "Calm, ate after.",
  });
  assert.equal(result.status, "edited");
  assert.equal(
    result.status === "edited" && result.changeSummary,
    `DHPP ${runId} vaccine was corrected: the date given changed from Sep 1, 2026 to Sep 2, 2026, the source changed from in house to by an outside vet, the vet clinic was set to Entries vet clinic ${runId}, the person who gave it was cleared (was Entries staff ${runId}), notes were edited, the manufacturer was cleared (was Generic Biologics) and the route changed from Subcutaneous (SQ) to Intramuscular (IM).`,
  );
});

test("a test's results can be corrected, and the event holds both sets", async () => {
  const animalId = await makeAnimal("Edit results");
  const input = comboTest();
  const { entryId } = await record(animalId, input);
  await edit(entryId, {
    ...input,
    results: [
      { analyteId: analyteIds.Antigen, result: TestResult.POSITIVE },
      { analyteId: analyteIds.Antibody, result: TestResult.NEGATIVE },
    ],
  });

  const entry = await readEntry(entryId);
  assert.deepEqual(
    entry.test?.results.map(({ analyteName, result }) => [analyteName, result]),
    [
      ["Antibody", TestResult.NEGATIVE],
      ["Antigen", TestResult.POSITIVE],
    ],
  );
  const [, edited] = await eventsOf(entryId);
  assert.deepEqual(Object.keys(edited.after as object), ["results"]);
  const [, row] = await activityOf(animalId);
  assert.equal(
    row.changeSummary,
    `Combo ${runId} test was corrected: the results changed from Antigen negative, Antibody negative to Antigen positive, Antibody negative.`,
  );
});

test("a save that changes nothing writes nothing", async () => {
  const animalId = await makeAnimal("No-op");
  const input = vaccine({ lotNumber: "A123", notes: "Calm." });
  const { entryId } = await record(animalId, input);
  const before = await readEntry(entryId);

  // Whitespace and the defaults it was recorded with read as unchanged.
  const result = await edit(entryId, {
    ...input,
    lotNumber: " A123 ",
    manufacturer: "Generic Biologics",
    route: MedicalRoute.SUBCUTANEOUS,
  });
  assert.equal(result.status, "unchanged");
  assert.equal((await eventsOf(entryId)).length, 1);
  assert.equal((await activityOf(animalId)).length, 1);
  assert.deepEqual((await readEntry(entryId)).updatedAt, before.updatedAt);
});

test("an edit doesn't refill a default that was cleared", async () => {
  const animalId = await makeAnimal("Cleared default");
  const input = vaccine();
  const { entryId } = await record(animalId, input);
  await edit(entryId, { ...input, manufacturer: null, route: null });
  const entry = await readEntry(entryId);
  assert.equal(entry.vaccine?.manufacturer, null);
  assert.equal(entry.vaccine?.route, null);
});

test("the item can change within its kind, but the kind can't change", async () => {
  const animalId = await makeAnimal("Item change");
  const input = vaccine();
  const { entryId } = await record(animalId, input);

  await refusedOn(edit(entryId, { ...input, itemId: dewormerId }), "itemId");
  await refusedOn(edit(entryId, { ...input, itemId: retiredVaccineId }), "itemId");
  await assert.rejects(
    edit(entryId, treatment()),
    (error: Error) =>
      error instanceof MedicalEntryRefusal && /kind can't change/.test(error.message),
  );

  const result = await edit(entryId, rabies());
  assert.equal(result.status, "edited");
  const entry = await readEntry(entryId);
  assert.equal(entry.itemId, rabiesId);
  assert.equal(entry.vaccine?.validUntilDate, "2027-09-01");
  assert.match(
    result.status === "edited" ? result.changeSummary : "",
    new RegExp(`the item changed from DHPP ${runId} to Rabies ${runId}`),
  );
});

test("an entry whose item was retired since can still be corrected", async () => {
  const animalId = await makeAnimal("Retired since");
  const itemId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name: `Retired since ${runId}`,
    speciesIds: [],
    analytes: [],
  });
  const input = vaccine({ itemId });
  const { entryId } = await record(animalId, input);
  await prisma.$transaction((tx) => retireMedicalItem(tx, itemId));

  const result = await edit(entryId, { ...input, lotNumber: "L-9" });
  assert.equal(result.status, "edited");
});

test("a test keeps the analytes it was recorded with until its item changes", async () => {
  const animalId = await makeAnimal("Analytes since");
  const itemId = await createItem({
    kind: MedicalItemKind.TEST,
    name: `Growing ${runId}`,
    speciesIds: [],
    analytes: [{ name: "First" }],
  });
  const [first] = await prisma.medicalItemAnalyte.findMany({ where: { itemId } });
  const input = comboTest({
    itemId,
    results: [{ analyteId: first.id, result: TestResult.NEGATIVE }],
  });
  const { entryId } = await record(animalId, input);
  await prisma.$transaction((tx) =>
    updateMedicalItem(tx, itemId, {
      kind: MedicalItemKind.TEST,
      name: `Growing ${runId}`,
      speciesIds: [],
      analytes: [{ id: first.id, name: "First" }, { name: "Second" }],
    }),
  );

  const result = await edit(entryId, { ...input, lotNumber: "K-1" });
  assert.equal(result.status, "edited");
});

test("renaming an analyte in the catalog leaves recorded results alone", async () => {
  const animalId = await makeAnimal("Analyte renamed");
  const itemId = await createItem({
    kind: MedicalItemKind.TEST,
    name: `Renamed analyte ${runId}`,
    speciesIds: [],
    analytes: [{ name: "Old name" }],
  });
  const [analyte] = await prisma.medicalItemAnalyte.findMany({ where: { itemId } });
  const input = comboTest({
    itemId,
    results: [{ analyteId: analyte.id, result: TestResult.NEGATIVE }],
  });
  const { entryId } = await record(animalId, input);
  await prisma.$transaction((tx) =>
    updateMedicalItem(tx, itemId, {
      kind: MedicalItemKind.TEST,
      name: `Renamed analyte ${runId}`,
      speciesIds: [],
      analytes: [{ id: analyte.id, name: "New name" }],
    }),
  );

  assert.equal((await edit(entryId, input)).status, "unchanged");

  await edit(entryId, { ...input, lotNumber: "K-2" });
  const [, edited] = await eventsOf(entryId);
  assert.deepEqual(edited.after, { lotNumber: "K-2" });
  assert.deepEqual(
    (await readEntry(entryId)).test?.results.map((row) => row.analyteName),
    ["Old name"],
  );
});

test("turning the catalog's rabies flag off or on doesn't block a correction", async () => {
  const animalId = await makeAnimal("Rabies flag");
  const flagged = (isRabies: boolean, name: string) =>
    prisma.$transaction((tx) =>
      updateMedicalItem(tx, itemId, {
        kind: MedicalItemKind.VACCINE,
        name,
        speciesIds: [],
        isRabies,
        analytes: [],
      }),
    );
  const name = `Flag flips ${runId}`;
  const itemId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name,
    speciesIds: [],
    isRabies: true,
    analytes: [],
  });
  const rabiesInput = vaccine({ itemId, durationMonths: 12, rabiesTagNumber: "T-9" });
  const wasRabies = await record(animalId, rabiesInput);

  // Off: the entry keeps its duration, tag and valid-until.
  await flagged(false, name);
  await edit(wasRabies.entryId, { ...rabiesInput, lotNumber: "L-1" });
  const kept = await readEntry(wasRabies.entryId);
  assert.equal(kept.vaccine?.durationMonths, 12);
  assert.equal(kept.vaccine?.rabiesTagNumber, "T-9");
  assert.equal(kept.vaccine?.validUntilDate, "2027-09-01");

  // On: an entry recorded before it was a rabies vaccine needs no duration.
  const plainInput = vaccine({ itemId });
  const plain = await record(animalId, plainInput);
  await flagged(true, name);
  assert.equal(
    (await edit(plain.entryId, { ...plainInput, lotNumber: "L-2" })).status,
    "edited",
  );
  assert.equal((await readEntry(plain.entryId)).vaccine?.durationMonths, null);
});

test("editing an entry that doesn't exist is refused", async () => {
  await assert.rejects(edit("missing", vaccine()), NotFoundError);
});

// ---------------------------------------------------------------------------
// Voiding
// ---------------------------------------------------------------------------

test("a void keeps the entry, records why, and is written once", async () => {
  const animalId = await makeAnimal("Void");
  const input = vaccine();
  const { entryId } = await record(animalId, input);

  await refusedOn(voidEntry(entryId, "   "), "reason");
  await voidEntry(entryId, "  Entered against the wrong animal. ");

  const entry = await readEntry(entryId);
  assert.ok(entry.voidedAt);
  assert.equal(entry.voidedById, editorId);
  assert.equal(entry.voidReason, "Entered against the wrong animal.");

  const events = await eventsOf(entryId);
  assert.equal(events[1].action, MedicalEntryEventAction.VOIDED);
  assert.deepEqual(events[1].after, {
    voidReason: "Entered against the wrong animal.",
  });
  const rows = await activityOf(animalId);
  assert.deepEqual(rows[1], {
    activityType: AnimalActivityType.MEDICAL_ENTRY_VOIDED,
    changedById: editorId,
    changeSummary: `DHPP ${runId} vaccine given on Sep 1, 2026 was voided. Reason: Entered against the wrong animal.`,
  });

  await assert.rejects(
    voidEntry(entryId, "Again."),
    (error: Error) =>
      error instanceof ConflictError && /record the entry again/.test(error.message),
  );
  await assert.rejects(edit(entryId, { ...input, lotNumber: "X" }), ConflictError);
  assert.equal((await eventsOf(entryId)).length, 2);
  assert.equal((await readEntry(entryId)).voidReason, "Entered against the wrong animal.");
});

test("two voids of one entry at once: one lands, the other is refused", async () => {
  const animalId = await makeAnimal("Void race");
  const { entryId } = await record(animalId, vaccine());
  const results = await Promise.allSettled([
    voidEntry(entryId, "First click."),
    voidEntry(entryId, "Second click."),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const refused = results.filter((r) => r.status === "rejected");
  assert.equal(refused.length, 1);
  assert.ok(refused[0].reason instanceof ConflictError);
});

// ---------------------------------------------------------------------------
// The lock
// ---------------------------------------------------------------------------

const backendPid = async (tx: TransactionClient) =>
  (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]
    .pid;

// The only proof a statement reached the lock and is blocked there, rather
// than not having started yet. Asking which sessions `holderPid` blocks keeps
// another test file's wait (the files run in parallel) from passing for this
// one.
const waitForSessionBlockedBy = async (holderPid: number) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))`;
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No session was seen waiting on backend ${holderPid}.`);
};

test("an edit waits for the animal lock, so two edits apply one after the other", async () => {
  const animalId = await makeAnimal("Held");
  const input = vaccine({ lotNumber: "A1" });
  const { entryId } = await record(animalId, input);

  // Both transactions are given longer than the five seconds the wait below
  // may take, so a slow machine fails on the wait, not on a timeout.
  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked!: (pid: number) => void;
  const isLocked = new Promise<number>((resolve) => (locked = resolve));
  // Stands in for another edit of the same animal, holding the lock while it
  // writes.
  const holder = prisma.$transaction(
    async (tx) => {
      await lockAnimal(tx, animalId);
      locked(await backendPid(tx));
      await released;
      await editMedicalEntry(tx, entryId, { ...input, lotNumber: "B2" }, staffId, TODAY);
    },
    { timeout },
  );
  // `holder` settles first only when it threw before handing back its pid.
  const holderPid = await Promise.race([isLocked, holder as Promise<never>]);

  const second = edit(entryId, { ...input, lotNumber: "C3" }, editorId, { timeout });
  // Observed as soon as it starts, so a failed wait is not followed by an
  // unhandled rejection. Awaiting it below still sees any rejection.
  void second.catch(() => {});
  try {
    await waitForSessionBlockedBy(holderPid);
    assert.equal((await eventsOf(entryId)).length, 1);
  } finally {
    // Released even when the wait fails, and both seen to their end, so
    // neither transaction outlives the test.
    release();
    await Promise.allSettled([holder, second]);
  }
  await holder;
  await second;

  // The second edit read what the first wrote, so its before is B2, not A1.
  const events = await eventsOf(entryId);
  assert.deepEqual(
    events.slice(1).map((event) => [event.before, event.after]),
    [
      [{ lotNumber: "A1" }, { lotNumber: "B2" }],
      [{ lotNumber: "B2" }, { lotNumber: "C3" }],
    ],
  );
});

test("an item can't change kind while an entry on it is being written", async () => {
  const animalId = await makeAnimal("Item race");
  const name = `Racing item ${runId}`;
  const itemId = await createItem({
    kind: MedicalItemKind.VACCINE,
    name,
    speciesIds: [],
    analytes: [],
  });

  const timeout = 20_000;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let recorded!: (pid: number) => void;
  const isRecorded = new Promise<number>((resolve) => (recorded = resolve));
  // Staff record a vaccine on the item, still uncommitted when the admin
  // tries to make the unused-looking item a treatment.
  const holder = prisma.$transaction(
    async (tx) => {
      await recordMedicalEntry(tx, { ...vaccine({ itemId }), animalId }, staffId, TODAY);
      recorded(await backendPid(tx));
      await released;
    },
    { timeout },
  );
  const holderPid = await Promise.race([isRecorded, holder as Promise<never>]);

  const retype = prisma.$transaction(
    (tx) =>
      updateMedicalItem(tx, itemId, {
        kind: MedicalItemKind.TREATMENT,
        name,
        speciesIds: [],
        analytes: [],
      }),
    { timeout },
  );
  void retype.catch(() => {});
  try {
    await waitForSessionBlockedBy(holderPid);
  } finally {
    release();
    await Promise.allSettled([holder, retype]);
  }
  await holder;
  await assert.rejects(retype, ConflictError);
  assert.equal(
    (await prisma.medicalItem.findUniqueOrThrow({ where: { id: itemId } })).kind,
    MedicalItemKind.VACCINE,
  );
});

// ---------------------------------------------------------------------------
// The derived read
// ---------------------------------------------------------------------------

test("the latest rabies vaccine ignores voided entries and counts an unknown day as oldest", async () => {
  const animalId = await makeAnimal("Latest rabies");
  assert.equal(await findLatestRabiesVaccine(prisma, animalId), null);

  const unknown = await record(
    animalId,
    rabies({ source: MedicalEntrySource.BEFORE_INTAKE, completedDate: null }),
  );
  assert.deepEqual(await findLatestRabiesVaccine(prisma, animalId), {
    entryId: unknown.entryId,
    completedDate: null,
    validUntilDate: null,
  });

  const august = await record(animalId, rabies({ completedDate: day("2026-08-10") }));
  // A later non-rabies vaccine doesn't count.
  await record(animalId, vaccine({ completedDate: day("2026-09-20") }));
  const september = await record(
    animalId,
    rabies({ completedDate: day("2026-09-01"), durationMonths: 36 }),
  );
  assert.equal(
    (await findLatestRabiesVaccine(prisma, animalId))?.entryId,
    september.entryId,
  );

  await voidEntry(september.entryId, "Wrong animal.");
  assert.deepEqual(await findLatestRabiesVaccine(prisma, animalId), {
    entryId: august.entryId,
    completedDate: "2026-08-10",
    validUntilDate: "2027-08-10",
  });
});
