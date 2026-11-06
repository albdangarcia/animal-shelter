// Surgeries in the medical record, against a real Postgres: scheduled,
// recorded, corrected, declined and voided through the entry service, as the
// actions drive it. A surgery has no catalog item; its procedure says what it
// is, and a spay or neuter must suit the animal's sex.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalActivityType,
  IntakeType,
  MedicalEntryEventAction,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
  MedicalItemKind,
  PartnerType,
  Sex,
  SurgeryEvidence,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  MedicalEntryRefusal,
  declineMedicalEntry,
  editMedicalEntry,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
  rescheduleMedicalEntry,
  scheduleMedicalEntry,
  voidMedicalEntry,
  type MedicalEntryInput,
  type RecordMedicalEntryInput,
  type SurgeryEntryInput,
} from "@/app/lib/services/medical-entry";
import { createMedicalItem } from "@/app/lib/services/medical-catalog";
import {
  findLatestRabiesVaccine,
  findMedicalHistoryPage,
  findRecentMedicalEntries,
  findVaccinesAndTests,
  type MedicalHistoryItem,
} from "@/app/lib/data/animals/medical-entry";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up the
// catalog items whose names end in its own runId.

// History's entries: the animals here have no conditions or care episodes,
// so every row of a page is an entry.
const historyEntries = (page: { items: MedicalHistoryItem[] }) =>
  page.items.flatMap((item) => (item.source === "ENTRY" ? [item.entry] : []));

const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-10");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;

let speciesId: string;
let colorId: string;
let staffId: string;
let editorId: string;
let clinicId: string;
let rabiesId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Surgery species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Surgery color") },
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
  staffId = await person("Surgery staff");
  editorId = await person("Surgery editor");
  clinicId = (
    await prisma.partner.create({
      data: { name: name("Surgery clinic"), type: PartnerType.VET_CLINIC },
      select: { id: true },
    })
  ).id;
  rabiesId = (
    await prisma.$transaction((tx) =>
      createMedicalItem(tx, {
        kind: MedicalItemKind.VACCINE,
        name: name("Rabies"),
        speciesIds: [],
        isRabies: true,
        analytes: [],
      }),
    )
  ).id;
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the entries, their details, events and activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.partner.deleteMany({ where: { id: clinicId } });
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
        birthDate: "2024-01-01",
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

const surgery = (overrides: Partial<SurgeryEntryInput> = {}): SurgeryEntryInput => ({
  kind: MedicalEntryKind.SURGERY,
  procedure: SurgeryProcedure.SPAY,
  completedDate: day("2026-10-03"),
  source: MedicalEntrySource.IN_HOUSE,
  ...overrides,
});

const record = (animalId: string, input: RecordMedicalEntryInput) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(tx, { ...input, animalId }, staffId, TODAY),
  );

const schedule = (
  animalId: string,
  procedure: SurgeryProcedure,
  dueDate: CalendarDay = day("2026-10-14"),
) =>
  prisma.$transaction((tx) =>
    scheduleMedicalEntry(
      tx,
      { animalId, kind: MedicalEntryKind.SURGERY, procedure, dueDate },
      staffId,
      TODAY,
    ),
  );

const recordScheduled = (entryId: string, input: RecordMedicalEntryInput) =>
  prisma.$transaction((tx) =>
    recordScheduledMedicalEntry(tx, entryId, input, editorId, TODAY),
  );

const edit = (entryId: string, input: MedicalEntryInput) =>
  prisma.$transaction((tx) => editMedicalEntry(tx, entryId, input, editorId, TODAY));

const entryOf = (entryId: string) =>
  prisma.medicalEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { surgery: true },
  });

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
          AnimalActivityType.MEDICAL_ENTRY_RESCHEDULED,
          AnimalActivityType.MEDICAL_ENTRY_DECLINED,
          AnimalActivityType.MEDICAL_ENTRY_RECORDED,
          AnimalActivityType.MEDICAL_ENTRY_EDITED,
          AnimalActivityType.MEDICAL_ENTRY_VOIDED,
        ],
      },
    },
    orderBy: { changedAt: "asc" },
    select: { activityType: true, changedById: true, changeSummary: true },
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

test("an in-house spay stores its procedure and details, with no item and nobody as giver", async () => {
  const animalId = await makeAnimal("In house");
  const { entryId, nextEntryId } = await record(
    animalId,
    surgery({ surgeon: " Dr. Patel ", findings: "Routine.", anesthesiaNotes: "" }),
  );
  assert.equal(nextEntryId, null);

  const entry = await entryOf(entryId);
  assert.equal(entry.kind, MedicalEntryKind.SURGERY);
  assert.equal(entry.status, MedicalEntryStatus.COMPLETED);
  assert.equal(entry.procedure, SurgeryProcedure.SPAY);
  assert.equal(entry.itemId, null);
  assert.equal(entry.chipNumber, null);
  assert.equal(entry.completedDate, "2026-10-03");
  assert.equal(entry.source, MedicalEntrySource.IN_HOUSE);
  // The surgeon is free text; whoever recorded it is the creator.
  assert.equal(entry.administeredById, null);
  assert.equal(entry.createdById, staffId);
  assert.deepEqual(
    {
      surgeon: entry.surgery?.surgeon,
      findings: entry.surgery?.findings,
      anesthesiaNotes: entry.surgery?.anesthesiaNotes,
      evidence: entry.surgery?.evidence,
    },
    { surgeon: "Dr. Patel", findings: "Routine.", anesthesiaNotes: null, evidence: null },
  );

  const [created] = await eventsOf(entryId);
  assert.equal(created.action, MedicalEntryEventAction.CREATED);
  assert.deepEqual(created.after, {
    kind: MedicalEntryKind.SURGERY,
    status: MedicalEntryStatus.COMPLETED,
    itemId: null,
    completedDate: "2026-10-03",
    source: MedicalEntrySource.IN_HOUSE,
    vetPartnerId: null,
    vetName: null,
    administeredById: null,
    notes: null,
    procedure: SurgeryProcedure.SPAY,
    surgeon: "Dr. Patel",
    findings: "Routine.",
    anesthesiaNotes: null,
    evidence: null,
  });
  assert.deepEqual(await activityOf(animalId), [
    {
      activityType: AnimalActivityType.MEDICAL_ENTRY_RECORDED,
      changedById: staffId,
      changeSummary: "Spay surgery recorded: done in house, on Oct 3, 2026.",
    },
  ]);
});

test("a surgery by an outside vet names the clinic", async () => {
  const animalId = await makeAnimal("Outside vet");
  const { entryId } = await record(
    animalId,
    surgery({ source: MedicalEntrySource.OUTSIDE_VET, vetPartnerId: clinicId }),
  );
  assert.equal((await entryOf(entryId)).vetPartnerId, clinicId);
  assert.deepEqual(
    (await activityOf(animalId)).map((row) => row.changeSummary),
    [
      `Spay surgery recorded: done by an outside vet at ${name("Surgery clinic")}, on Oct 3, 2026.`,
    ],
  );
});

test("a surgery before intake can have an unknown day, and needs its evidence", async () => {
  const animalId = await makeAnimal("Before intake", Sex.MALE);
  const before = surgery({
    procedure: SurgeryProcedure.NEUTER,
    source: MedicalEntrySource.BEFORE_INTAKE,
    completedDate: null,
  });

  await refusedOn(record(animalId, before), "evidence", /done before intake/);
  await refusedOn(
    record(animalId, surgery({ procedure: SurgeryProcedure.NEUTER, evidence: SurgeryEvidence.SCAR })),
    "evidence",
    /only for a surgery done before intake/,
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);

  const { entryId } = await record(animalId, { ...before, evidence: SurgeryEvidence.TATTOO });
  const entry = await entryOf(entryId);
  assert.equal(entry.completedDate, null);
  assert.equal(entry.surgery?.evidence, SurgeryEvidence.TATTOO);
  assert.deepEqual(
    (await activityOf(animalId)).map((row) => row.changeSummary),
    ["Neuter surgery recorded: done before intake, on an unknown date. Evidence: tattoo."],
  );
});

test("a surgery needs its procedure", async () => {
  const animalId = await makeAnimal("No procedure");
  await refusedOn(
    record(animalId, surgery({ procedure: undefined as unknown as SurgeryProcedure })),
    "procedure",
    /Pick the procedure/,
  );
  await refusedOn(
    prisma.$transaction((tx) =>
      scheduleMedicalEntry(
        tx,
        {
          animalId,
          kind: MedicalEntryKind.SURGERY,
          procedure: null as unknown as SurgeryProcedure,
          dueDate: day("2026-10-14"),
        },
        staffId,
        TODAY,
      ),
    ),
    "procedure",
    /Pick the procedure/,
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);
});

test("a spay is refused for a male and a neuter for a female; an animal of unknown sex can have either", async () => {
  const male = await makeAnimal("Male", Sex.MALE);
  const female = await makeAnimal("Female", Sex.FEMALE);
  const unknown = await makeAnimal("Unknown sex", Sex.UNKNOWN);
  const alsoUnknown = await makeAnimal("Also unknown sex", Sex.UNKNOWN);

  await refusedOn(record(male, surgery()), "procedure", /spay is for a female/);
  await refusedOn(schedule(male, SurgeryProcedure.SPAY), "procedure", /spay is for a female/);
  await refusedOn(
    record(female, surgery({ procedure: SurgeryProcedure.NEUTER })),
    "procedure",
    /neuter is for a male/,
  );
  await refusedOn(schedule(female, SurgeryProcedure.NEUTER), "procedure", /neuter is for a male/);

  // Other procedures suit either sex.
  await record(male, surgery({ procedure: SurgeryProcedure.DENTAL }));
  // One each: a second spay or neuter is refused whatever the sex.
  await record(unknown, surgery({ procedure: SurgeryProcedure.SPAY }));
  await record(alsoUnknown, surgery({ procedure: SurgeryProcedure.NEUTER }));
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: male } }), 1);
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: female } }), 0);
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: unknown } }), 1);
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: alsoUnknown } }), 1);
});

test("a correction can change the procedure, under the sex rule, and keeps what it leaves out", async () => {
  const female = await makeAnimal("Corrected female");
  const { entryId } = await record(
    female,
    surgery({ surgeon: "Dr. Patel", findings: "Routine.", anesthesiaNotes: "Isoflurane." }),
  );

  await refusedOn(
    edit(entryId, surgery({ procedure: SurgeryProcedure.NEUTER })),
    "procedure",
    /neuter is for a male/,
  );

  // Findings edited, the rest left out: kept, not cleared.
  const findings = await edit(entryId, {
    kind: MedicalEntryKind.SURGERY,
    procedure: SurgeryProcedure.SPAY,
    completedDate: day("2026-10-03"),
    source: MedicalEntrySource.IN_HOUSE,
    findings: "Small hernia repaired.",
  });
  assert.equal(findings.status, "edited");
  assert.equal(
    findings.status === "edited" && findings.changeSummary,
    "Spay surgery was corrected: findings were edited.",
  );
  const entry = await entryOf(entryId);
  assert.equal(entry.surgery?.surgeon, "Dr. Patel");
  assert.equal(entry.surgery?.anesthesiaNotes, "Isoflurane.");
  assert.equal(entry.surgery?.findings, "Small hernia repaired.");

  // A save that changes nothing writes nothing.
  const eventsBefore = (await eventsOf(entryId)).length;
  const unchanged = await edit(entryId, surgery());
  assert.equal(unchanged.status, "unchanged");
  assert.equal((await eventsOf(entryId)).length, eventsBefore);

  // The sex rule runs only when the procedure changes: a later change to the
  // animal's sex doesn't block a correction to something else.
  await prisma.animal.update({ where: { id: female }, data: { sex: Sex.MALE } });
  const surgeon = await edit(entryId, surgery({ surgeon: "Dr. Okafor" }));
  assert.equal(surgeon.status, "edited");
  assert.equal(
    surgeon.status === "edited" && surgeon.changeSummary,
    "Spay surgery was corrected: the surgeon changed from Dr. Patel to Dr. Okafor.",
  );

  // On an animal of unknown sex, a spay recorded as a neuter by mistake is
  // corrected, not voided.
  const unknown = await makeAnimal("Corrected unknown", Sex.UNKNOWN);
  const { entryId: neuterId } = await record(
    unknown,
    surgery({ procedure: SurgeryProcedure.NEUTER }),
  );
  const procedure = await edit(neuterId, surgery());
  assert.equal(
    procedure.status === "edited" && procedure.changeSummary,
    "Spay surgery was corrected: the procedure changed from neuter to spay.",
  );
  assert.equal((await entryOf(neuterId)).procedure, SurgeryProcedure.SPAY);
  const edited = (await eventsOf(neuterId)).at(-1);
  assert.equal(edited?.action, MedicalEntryEventAction.EDITED);
  assert.deepEqual(edited?.before, { procedure: SurgeryProcedure.NEUTER });
  assert.deepEqual(edited?.after, { procedure: SurgeryProcedure.SPAY });
});

test("a surgery is voided like any entry, and the activity names it", async () => {
  const animalId = await makeAnimal("Voided");
  const { entryId } = await record(animalId, surgery({ procedure: SurgeryProcedure.MASS_REMOVAL }));
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, entryId, "Wrong animal.", editorId),
  );
  const entry = await entryOf(entryId);
  assert.ok(entry.voidedAt);
  assert.equal(entry.voidReason, "Wrong animal.");
  assert.deepEqual(
    (await activityOf(animalId)).map((row) => row.changeSummary),
    [
      "Mass removal surgery recorded: done in house, on Oct 3, 2026.",
      "Mass removal surgery done on Oct 3, 2026 was voided. Reason: Wrong animal.",
    ],
  );
  // "Other" reads as a surgery once, not twice.
  const other = await record(animalId, surgery({ procedure: SurgeryProcedure.OTHER }));
  await prisma.$transaction((tx) =>
    voidMedicalEntry(tx, other.entryId, "Entered twice.", editorId),
  );
  assert.deepEqual(
    (await activityOf(animalId)).slice(2).map((row) => row.changeSummary),
    [
      "Other surgery recorded: done in house, on Oct 3, 2026.",
      "Other surgery done on Oct 3, 2026 was voided. Reason: Entered twice.",
    ],
  );
});

test("a surgery is scheduled by its procedure, rescheduled, then recorded as given with its details", async () => {
  const animalId = await makeAnimal("Scheduled", Sex.UNKNOWN);
  const { entryId } = await schedule(animalId, SurgeryProcedure.NEUTER);

  const scheduled = await entryOf(entryId);
  assert.equal(scheduled.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(scheduled.procedure, SurgeryProcedure.NEUTER);
  assert.equal(scheduled.itemId, null);
  assert.equal(scheduled.source, null);
  assert.equal(scheduled.surgery, null);
  const [created] = await eventsOf(entryId);
  assert.deepEqual(created.after, {
    kind: MedicalEntryKind.SURGERY,
    status: MedicalEntryStatus.SCHEDULED,
    procedure: SurgeryProcedure.NEUTER,
    dueDate: "2026-10-14",
    notes: null,
  });

  await prisma.$transaction((tx) =>
    rescheduleMedicalEntry(tx, entryId, day("2026-10-12"), editorId, TODAY),
  );

  // Recorded as the spay it turned out to be.
  await recordScheduled(
    entryId,
    surgery({ completedDate: day("2026-10-09"), surgeon: "Dr. Patel" }),
  );
  const given = await entryOf(entryId);
  assert.equal(given.status, MedicalEntryStatus.COMPLETED);
  assert.equal(given.procedure, SurgeryProcedure.SPAY);
  assert.equal(given.dueDate, "2026-10-12");
  assert.equal(given.surgery?.surgeon, "Dr. Patel");
  const completed = (await eventsOf(entryId)).at(-1);
  assert.equal(completed?.action, MedicalEntryEventAction.COMPLETED);
  assert.deepEqual(completed?.before, { status: MedicalEntryStatus.SCHEDULED });
  assert.equal(
    (completed?.after as Record<string, unknown>).procedure,
    SurgeryProcedure.SPAY,
  );

  assert.deepEqual(
    (await activityOf(animalId)).map((row) => row.changeSummary),
    [
      "Neuter surgery scheduled for Oct 14, 2026.",
      "Neuter surgery rescheduled from Oct 14, 2026 to Oct 12, 2026.",
      "Spay surgery recorded: done in house, on Oct 9, 2026 (due Oct 12, 2026).",
    ],
  );
});

test("recording scheduled surgery as another procedure applies the sex rule", async () => {
  const animalId = await makeAnimal("Scheduled female");
  const { entryId } = await schedule(animalId, SurgeryProcedure.SPAY);
  await refusedOn(
    recordScheduled(entryId, surgery({ procedure: SurgeryProcedure.NEUTER })),
    "procedure",
    /neuter is for a male/,
  );
  assert.equal((await entryOf(entryId)).status, MedicalEntryStatus.SCHEDULED);
});

test("recording a scheduled surgery as planned doesn't re-check the animal's sex", async () => {
  const animalId = await makeAnimal("Sex changed since");
  const { entryId } = await schedule(animalId, SurgeryProcedure.SPAY);
  // Corrected on the animal's record after the spay was planned.
  await prisma.animal.update({ where: { id: animalId }, data: { sex: Sex.MALE } });

  await recordScheduled(entryId, surgery());
  const given = await entryOf(entryId);
  assert.equal(given.status, MedicalEntryStatus.COMPLETED);
  assert.equal(given.procedure, SurgeryProcedure.SPAY);
});

test("a surgery never schedules a next one", async () => {
  const animalId = await makeAnimal("No next");
  const next = { dueDate: day("2026-11-01") };
  await refusedOn(
    record(animalId, { ...surgery(), scheduleNext: next }),
    "scheduleNext",
    /Only a catalog item can repeat/,
  );
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);

  const { entryId } = await schedule(animalId, SurgeryProcedure.DENTAL);
  await refusedOn(
    recordScheduled(entryId, {
      ...surgery({ procedure: SurgeryProcedure.DENTAL }),
      scheduleNext: next,
    }),
    "scheduleNext",
    /Only a catalog item can repeat/,
  );
  assert.equal((await entryOf(entryId)).status, MedicalEntryStatus.SCHEDULED);
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 1);
});

test("a scheduled dental can be declined; a scheduled spay or neuter can't be declined without an exemption", async () => {
  const animalId = await makeAnimal("Declined");
  const dental = await schedule(animalId, SurgeryProcedure.DENTAL);
  await prisma.$transaction((tx) =>
    declineMedicalEntry(tx, dental.entryId, "Teeth fine on exam.", editorId),
  );
  const declined = await entryOf(dental.entryId);
  assert.equal(declined.status, MedicalEntryStatus.DECLINED);
  assert.equal(declined.declineReason, "Teeth fine on exam.");

  assert.deepEqual(
    (await activityOf(animalId)).map((row) => row.changeSummary),
    [
      "Dental surgery scheduled for Oct 14, 2026.",
      "Dental surgery due Oct 14, 2026 was declined. Reason: Teeth fine on exam.",
    ],
  );

  for (const [procedure, sex] of [
    [SurgeryProcedure.SPAY, Sex.FEMALE],
    [SurgeryProcedure.NEUTER, Sex.MALE],
  ] as const) {
    const refusedId = await makeAnimal(`Declined ${procedure}`, sex);
    const { entryId } = await schedule(refusedId, procedure);
    await refusedOn(
      prisma.$transaction((tx) =>
        declineMedicalEntry(tx, entryId, "Too young.", editorId),
      ),
      "exemptionReason",
      /records an exemption/,
    );
    const entry = await entryOf(entryId);
    assert.equal(entry.status, MedicalEntryStatus.SCHEDULED, procedure);
    assert.equal(entry.declineReason, null, procedure);
    // Nothing written beyond the scheduling.
    assert.deepEqual(
      (await eventsOf(entryId)).map((event) => event.action),
      [MedicalEntryEventAction.CREATED],
      procedure,
    );
    assert.equal((await activityOf(refusedId)).length, 1, procedure);
  }
});

test("history lists surgeries and filters to them; the vaccine reads leave them out", async () => {
  const animalId = await makeAnimal("History");
  const { entryId: rabiesEntryId } = await record(animalId, {
    kind: MedicalEntryKind.VACCINE,
    itemId: rabiesId,
    completedDate: day("2026-09-01"),
    source: MedicalEntrySource.IN_HOUSE,
    durationMonths: 12,
  });
  const { entryId: spayId } = await record(animalId, surgery());
  const { entryId: dentalId } = await schedule(animalId, SurgeryProcedure.DENTAL);

  const all = await findMedicalHistoryPage(prisma, animalId, {
    kinds: [],
    page: 1,
    perPage: 10,
    timeZone: "UTC",
  });
  assert.deepEqual(
    historyEntries(all).map((entry) => entry.id),
    [dentalId, spayId, rabiesEntryId],
  );
  const surgeries = await findMedicalHistoryPage(prisma, animalId, {
    kinds: [MedicalEntryKind.SURGERY],
    page: 1,
    perPage: 10,
    timeZone: "UTC",
  });
  assert.deepEqual(
    historyEntries(surgeries).map((entry) => [entry.id, entry.procedure, entry.item]),
    [
      [dentalId, SurgeryProcedure.DENTAL, null],
      [spayId, SurgeryProcedure.SPAY, null],
    ],
  );
  assert.equal(historyEntries(surgeries)[1].surgery?.evidence, null);

  // Still the rabies vaccine, and Vaccines & Tests holds only it.
  assert.equal((await findLatestRabiesVaccine(prisma, animalId))?.entryId, rabiesEntryId);
  assert.deepEqual(
    (await findVaccinesAndTests(prisma, animalId)).map((entry) => entry.id),
    [rabiesEntryId],
  );
  // Recent entries are every completed entry, the surgery among them.
  assert.deepEqual(
    (await findRecentMedicalEntries(prisma, animalId, 5)).map((entry) => entry.id),
    [spayId, rabiesEntryId],
  );
});
