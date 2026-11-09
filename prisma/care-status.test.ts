// The care each animal is under, read from its medical record against a real
// Postgres: the open episode, recovering, awaited care and the problem list
// (`findCareStatus`), the attention queue's "under care with nothing
// planned" signal (`findUnplannedCareForQueue`), and the dashboard's list of
// animals under care (`findOpenCareEpisodes`). Every row is written through
// the services, as the pages write them.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  CareEpisodeType,
  DoseSlot,
  DoseUnit,
  FosterPlacementType,
  IntakeType,
  LocationType,
  MedicalConditionStatus,
  MedicalConditionType,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalItemKind,
  MedicalRoute,
  MedicationFrequency,
  PartnerType,
  Sex,
  SurgeryEvidence,
  SurgeryProcedure,
  TaskCategory,
  TaskStatus,
  ExamType,
} from "@/prisma/generated/enums";
import {
  closeCareEpisode,
  openCareEpisode,
  voidCareEpisode,
  type CareEpisodeInput,
} from "@/app/lib/services/care-episode";
import {
  addMedicalCondition,
  editMedicalCondition,
  voidMedicalCondition,
  type MedicalConditionInput,
} from "@/app/lib/services/medical-condition";
import {
  recordMedicalEntry,
  scheduleMedicalEntry,
  voidMedicalEntry,
  type ScheduleMedicalEntryInput,
} from "@/app/lib/services/medical-entry";
import type { SurgeryEntryInput } from "@/app/lib/services/medical-entry-values";
import { createMedicalItem } from "@/app/lib/services/medical-catalog";
import {
  createMedicationOrder,
  discontinueMedicationOrder,
  voidMedicationOrder,
  type MedicationOrderInput,
} from "@/app/lib/services/medication-order";
import { findCareStatus } from "@/app/lib/data/animals/care-status";
import {
  findOpenCareEpisodes,
  findUnplannedCareForQueue,
} from "@/app/lib/data/care-episodes";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

// Random, not the time: the files run in parallel, and each cleans up what
// carries its own runId.
const runId = randomUUID().slice(0, 8);
const TODAY = calendarDay("2026-10-14");
const INTAKE_DAY = calendarDay("2026-08-01");
const day = calendarDay;

let speciesId: string;
let colorId: string;
let staffId: string;
let fosterPersonId: string;
let fosterProfileId: string;
let clinicId: string;
let medicalLocationId: string;
let medicalUnitId: string;
let kennelLocationId: string;
let kennelUnitId: string;
let medicationId: string | null = null;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({
      data: { name: name("Care species") },
      select: { id: true },
    })
  ).id;
  colorId = (
    await prisma.color.create({
      data: { name: name("Care color") },
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
  staffId = await person("Care staff");
  fosterPersonId = await person("Care foster");
  fosterProfileId = (
    await prisma.fosterProfile.create({
      data: { personId: fosterPersonId },
      select: { id: true },
    })
  ).id;
  clinicId = (
    await prisma.partner.create({
      data: { name: name("Care Clinic"), type: PartnerType.VET_CLINIC },
      select: { id: true },
    })
  ).id;
  const place = async (label: string, type: LocationType, unit: string) => {
    const locationId = (
      await prisma.location.create({
        data: { name: name(label), type },
        select: { id: true },
      })
    ).id;
    const unitId = (
      await prisma.unit.create({
        data: { name: unit, capacity: 4, locationId },
        select: { id: true },
      })
    ).id;
    return { locationId, unitId };
  };
  ({ locationId: medicalLocationId, unitId: medicalUnitId } = await place(
    "Care wing",
    LocationType.MEDICAL,
    "MED-1",
  ));
  ({ locationId: kennelLocationId, unitId: kennelUnitId } = await place(
    "Care kennels",
    LocationType.KENNEL,
    "K-1",
  ));
});

after(async () => {
  await prisma.fosterPlacement.deleteMany({ where: { placedById: staffId } });
  await prisma.fosterProfile.deleteMany({ where: { id: fosterProfileId } });
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the episodes, conditions, entries, tasks, their events and
  // activity rows.
  await prisma.animal.deleteMany({ where: { speciesId } });
  // Its orders went with the animals.
  if (medicationId) await prisma.medicalItem.deleteMany({ where: { id: medicationId } });
  await prisma.unit.deleteMany({
    where: { locationId: { in: [medicalLocationId, kennelLocationId] } },
  });
  await prisma.location.deleteMany({
    where: { id: { in: [medicalLocationId, kennelLocationId] } },
  });
  await prisma.partner.deleteMany({ where: { id: clinicId } });
  await prisma.person.deleteMany({
    where: { id: { in: [staffId, fosterPersonId] } },
  });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (
  label: string,
  options: { sex?: Sex; currentUnitId?: string } = {},
) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: options.sex ?? Sex.MALE,
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

const openEpisode = async (
  animalId: string,
  input: Partial<CareEpisodeInput> = {},
) =>
  (
    await prisma.$transaction((tx) =>
      openCareEpisode(
        tx,
        {
          animalId,
          type: CareEpisodeType.HOSPITALISED_IN_HOUSE,
          startDate: day("2026-10-03"),
          reason: "Under observation.",
          ...input,
        },
        staffId,
        TODAY,
      ),
    )
  ).episodeId;

const addCondition = async (
  animalId: string,
  input: Pick<MedicalConditionInput, "name"> & Partial<MedicalConditionInput>,
) =>
  (
    await prisma.$transaction((tx) =>
      addMedicalCondition(
        tx,
        {
          animalId,
          type: MedicalConditionType.CONDITION,
          status: MedicalConditionStatus.ACTIVE,
          ...input,
        },
        staffId,
        TODAY,
      ),
    )
  ).conditionId;

const recordSurgery = async (
  animalId: string,
  input: Partial<SurgeryEntryInput>,
) =>
  (
    await prisma.$transaction((tx) =>
      recordMedicalEntry(
        tx,
        {
          animalId,
          kind: MedicalEntryKind.SURGERY,
          procedure: SurgeryProcedure.DENTAL,
          completedDate: day("2026-10-02"),
          source: MedicalEntrySource.IN_HOUSE,
          ...input,
        } as SurgeryEntryInput & { animalId: string },
        staffId,
        TODAY,
      ),
    )
  ).entryId;

type ScheduledKind =
  | { kind: typeof MedicalEntryKind.EXAM; examType: ExamType }
  | { kind: typeof MedicalEntryKind.SURGERY; procedure: SurgeryProcedure };

/**
 * Schedules an exam or surgery due `dueDate`. Care due before TODAY is
 * scheduled as if on its due day, when that day wasn't in the past.
 */
const schedule = async (animalId: string, dueDate: CalendarDay, care: ScheduledKind) =>
  (
    await prisma.$transaction((tx) =>
      scheduleMedicalEntry(
        tx,
        { animalId, dueDate, ...care } as ScheduleMedicalEntryInput,
        staffId,
        dueDate < TODAY ? dueDate : TODAY,
      ),
    )
  ).entryId;

const voidEntry = (entryId: string) =>
  prisma.$transaction((tx) => voidMedicalEntry(tx, entryId, "Entered in error.", staffId));

const addTask = (animalId: string, status: TaskStatus) =>
  prisma.task.create({
    data: {
      title: "Recheck",
      category: TaskCategory.MEDICAL,
      status,
      animalId,
      createdById: staffId,
    },
  });

const archive = (animalId: string) =>
  prisma.animal.update({
    where: { id: animalId },
    data: { listingStatus: AnimalListingStatus.ARCHIVED },
  });

// ---------------------------------------------------------------------------
// findCareStatus
// ---------------------------------------------------------------------------

test("reads each animal's open episode, recovering, awaited care and problem list in one call", async () => {
  const fido = await makeAnimal("Fido");
  // A closed episode earlier in the stay is not the open one.
  const closedId = await openEpisode(fido, {
    startDate: day("2026-08-10"),
    endDate: day("2026-08-20"),
  });
  const openId = await openEpisode(fido);

  const heartworm = await addCondition(fido, {
    name: "Heartworm disease",
    onsetDate: day("2026-08-15"),
  });
  const arthritis = await addCondition(fido, {
    name: "Arthritis",
    status: MedicalConditionStatus.CHRONIC,
  });
  const otitis = await addCondition(fido, { name: "Otitis" });
  await prisma.$transaction((tx) =>
    editMedicalCondition(
      tx,
      otitis,
      { status: MedicalConditionStatus.RESOLVED, resolvedDate: day("2026-09-01") },
      staffId,
      TODAY,
    ),
  );
  const ringworm = await addCondition(fido, { name: "Ringworm" });
  await prisma.$transaction((tx) =>
    voidMedicalCondition(tx, ringworm, "Recorded on the wrong animal.", staffId),
  );
  const penicillin = await addCondition(fido, {
    type: MedicalConditionType.ALLERGY,
    name: "Penicillin",
  });
  const grass = await addCondition(fido, {
    type: MedicalConditionType.ALLERGY,
    name: "Grass",
  });
  await prisma.$transaction((tx) =>
    editMedicalCondition(
      tx,
      grass,
      { status: MedicalConditionStatus.RESOLVED, resolvedDate: day("2026-09-10") },
      staffId,
      TODAY,
    ),
  );

  // Out of the window, inside it, and a later one voided: the dental on
  // Oct 2 is what he is recovering from.
  await recordSurgery(fido, { completedDate: day("2026-09-29") });
  const dental = await recordSurgery(fido, { completedDate: day("2026-10-02") });
  await voidEntry(
    await recordSurgery(fido, {
      procedure: SurgeryProcedure.MASS_REMOVAL,
      completedDate: day("2026-10-10"),
    }),
  );

  await schedule(fido, day("2026-10-20"), {
    kind: MedicalEntryKind.EXAM,
    examType: ExamType.VET,
  });
  const recheck = await schedule(fido, day("2026-10-16"), {
    kind: MedicalEntryKind.EXAM,
    examType: ExamType.RECHECK,
  });
  // Earlier, but voided.
  await voidEntry(
    await schedule(fido, day("2026-10-15"), {
      kind: MedicalEntryKind.EXAM,
      examType: ExamType.VET,
    }),
  );
  const massRemoval = await schedule(fido, day("2026-10-12"), {
    kind: MedicalEntryKind.SURGERY,
    procedure: SurgeryProcedure.MASS_REMOVAL,
  });
  const neuter = await schedule(fido, day("2026-10-18"), {
    kind: MedicalEntryKind.SURGERY,
    procedure: SurgeryProcedure.NEUTER,
  });

  const daisy = await makeAnimal("Daisy", { sex: Sex.FEMALE });
  // Voided while open: it no longer counts, so another opens.
  const voidedId = await openEpisode(daisy, { startDate: day("2026-10-01") });
  await prisma.$transaction((tx) =>
    voidCareEpisode(tx, voidedId, "Wrong animal.", staffId),
  );
  const underCareId = await openEpisode(daisy, {
    type: CareEpisodeType.UNDER_VET_CARE,
    startDate: day("2026-10-09"),
    partnerId: clinicId,
  });
  // Done before intake on a day nobody knows: never recovering.
  await recordSurgery(daisy, {
    procedure: SurgeryProcedure.SPAY,
    completedDate: null,
    source: MedicalEntrySource.BEFORE_INTAKE,
    evidence: SurgeryEvidence.OWNER_RECORDS,
  });

  const quiet = await makeAnimal("Quiet");
  // Only a closed episode, and only a voided one: neither is open.
  const closedOnly = await makeAnimal("Closed only");
  const closedOnlyEpisode = await openEpisode(closedOnly, { startDate: day("2026-10-01") });
  await prisma.$transaction((tx) =>
    closeCareEpisode(tx, closedOnlyEpisode, day("2026-10-04"), staffId, TODAY),
  );
  const voidedOnly = await makeAnimal("Voided only");
  const voidedOnlyEpisode = await openEpisode(voidedOnly);
  await prisma.$transaction((tx) =>
    voidCareEpisode(tx, voidedOnlyEpisode, "Wrong animal.", staffId),
  );

  const status = await findCareStatus(
    prisma,
    [fido, daisy, quiet, closedOnly, voidedOnly],
    TODAY,
  );

  assert.deepEqual(status.get(fido), {
    episode: {
      id: openId,
      type: CareEpisodeType.HOSPITALISED_IN_HOUSE,
      startDate: "2026-10-03",
      clinicName: null,
    },
    recovering: {
      entryId: dental,
      procedure: SurgeryProcedure.DENTAL,
      surgeryDate: "2026-10-02",
    },
    awaiting: {
      exam: { entryId: recheck, dueDate: "2026-10-16", overdue: false, label: "recheck exam" },
      surgery: {
        entryId: massRemoval,
        dueDate: "2026-10-12",
        overdue: true,
        label: "surgery (mass removal)",
      },
      spayNeuter: { entryId: neuter, dueDate: "2026-10-18", overdue: false, label: "neuter" },
    },
    allergies: [{ id: penicillin, name: "Penicillin" }],
    conditions: [
      { id: arthritis, name: "Arthritis", status: MedicalConditionStatus.CHRONIC },
      { id: heartworm, name: "Heartworm disease", status: MedicalConditionStatus.ACTIVE },
    ],
  });
  assert.notEqual(status.get(fido)?.episode?.id, closedId);

  assert.deepEqual(status.get(daisy), {
    episode: {
      id: underCareId,
      type: CareEpisodeType.UNDER_VET_CARE,
      startDate: "2026-10-09",
      clinicName: name("Care Clinic"),
    },
    recovering: null,
    awaiting: { exam: null, surgery: null, spayNeuter: null },
    allergies: [],
    conditions: [],
  });

  const nothing = {
    episode: null,
    recovering: null,
    awaiting: { exam: null, surgery: null, spayNeuter: null },
    allergies: [],
    conditions: [],
  };
  assert.deepEqual(status.get(quiet), nothing);
  assert.deepEqual(status.get(closedOnly), nothing);
  assert.deepEqual(status.get(voidedOnly), nothing);
});

test("a surgery reads recovering through the 14th day after it, and not the 15th", async () => {
  const animalId = await makeAnimal("Rusty");
  const surgeryId = await recordSurgery(animalId, {
    procedure: SurgeryProcedure.MASS_REMOVAL,
    completedDate: day("2026-09-30"),
  });
  const onDay14 = (await findCareStatus(prisma, [animalId], TODAY)).get(animalId);
  assert.deepEqual(onDay14?.recovering, {
    entryId: surgeryId,
    procedure: SurgeryProcedure.MASS_REMOVAL,
    surgeryDate: "2026-09-30",
  });
  const onDay15 = (
    await findCareStatus(prisma, [animalId], day("2026-10-15"))
  ).get(animalId);
  assert.equal(onDay15?.recovering, null);
});

// ---------------------------------------------------------------------------
// findUnplannedCareForQueue
// ---------------------------------------------------------------------------

test("the queue takes an open episode with nothing planned, and leaves out tasks, scheduled care, closed episodes and animals that left", async () => {
  // Under care with nothing planned: a finished task, and scheduled care
  // since voided, plan nothing.
  const unplanned = await makeAnimal("Unplanned", { currentUnitId: medicalUnitId });
  const unplannedEpisode = await openEpisode(unplanned, { startDate: day("2026-10-05") });
  await addTask(unplanned, TaskStatus.DONE);
  await voidEntry(
    await schedule(unplanned, day("2026-10-20"), {
      kind: MedicalEntryKind.EXAM,
      examType: ExamType.VET,
    }),
  );

  const withTask = await makeAnimal("With task");
  await openEpisode(withTask);
  await addTask(withTask, TaskStatus.TODO);

  const withTaskInProgress = await makeAnimal("With task in progress");
  await openEpisode(withTaskInProgress);
  await addTask(withTaskInProgress, TaskStatus.IN_PROGRESS);

  const withScheduledCare = await makeAnimal("With scheduled care");
  await openEpisode(withScheduledCare);
  await schedule(withScheduledCare, day("2026-10-20"), {
    kind: MedicalEntryKind.EXAM,
    examType: ExamType.RECHECK,
  });

  const closed = await makeAnimal("Closed");
  const closedEpisode = await openEpisode(closed);
  await prisma.$transaction((tx) =>
    closeCareEpisode(tx, closedEpisode, day("2026-10-08"), staffId, TODAY),
  );

  const voided = await makeAnimal("Voided");
  const voidedEpisode = await openEpisode(voided);
  await prisma.$transaction((tx) =>
    voidCareEpisode(tx, voidedEpisode, "Wrong animal.", staffId),
  );

  const left = await makeAnimal("Left");
  await openEpisode(left);
  await archive(left);

  const mine = [
    unplanned,
    withTask,
    withTaskInProgress,
    withScheduledCare,
    closed,
    voided,
    left,
  ];
  const rows = (await findUnplannedCareForQueue(prisma, TODAY)).filter((row) =>
    mine.includes(row.animal.id),
  );
  assert.deepEqual(rows, [
    {
      animal: {
        id: unplanned,
        name: name("Unplanned"),
        species: name("Care species"),
        currentUnit: `${name("Care wing")} · MED-1`,
      },
      episodeId: unplannedEpisode,
      episodeType: CareEpisodeType.HOSPITALISED_IN_HOUSE,
      startDate: "2026-10-05",
    },
  ]);
});

test("a medication order running or still to start is planned care; one ended, discontinued or voided isn't", async () => {
  medicationId ??= (
    await prisma.$transaction((tx) =>
      createMedicalItem(tx, {
        kind: MedicalItemKind.MEDICATION,
        name: name("Care doxycycline"),
        speciesIds: [],
        analytes: [],
      }),
    )
  ).id;
  const itemId = medicationId;
  const order = async (animalId: string, input: Partial<MedicationOrderInput> = {}) =>
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
            startDate: day("2026-10-01"),
            firstSlot: DoseSlot.AM,
            ...input,
          },
          staffId,
          TODAY,
        ),
      )
    ).orderId;
  const underCare = async (label: string) => {
    const animalId = await makeAnimal(label);
    await openEpisode(animalId);
    return animalId;
  };

  // Planned: running with no end, ending today, as needed, and starting later.
  const running = await underCare("Order running");
  await order(running);
  const endsToday = await underCare("Order ends today");
  await order(endsToday, { endDate: TODAY });
  const asNeeded = await underCare("Order as needed");
  await order(asNeeded, { frequency: MedicationFrequency.PRN, firstSlot: null });
  const upcoming = await underCare("Order upcoming");
  await order(upcoming, { startDate: day("2026-10-20") });

  // Not planned: ended yesterday, discontinued, voided.
  const ended = await underCare("Order ended");
  await order(ended, { endDate: day("2026-10-13") });
  const discontinued = await underCare("Order discontinued");
  const discontinuedOrder = await order(discontinued);
  await prisma.$transaction((tx) =>
    discontinueMedicationOrder(
      tx,
      discontinuedOrder,
      { day: day("2026-10-10"), reason: "Course changed" },
      staffId,
      TODAY,
    ),
  );
  const voided = await underCare("Order voided");
  const voidedOrder = await order(voided);
  await prisma.$transaction((tx) =>
    voidMedicationOrder(tx, voidedOrder, "Wrong animal.", staffId),
  );

  const mine = [running, endsToday, asNeeded, upcoming, ended, discontinued, voided];
  const listed = (await findUnplannedCareForQueue(prisma, TODAY))
    .map((row) => row.animal.id)
    .filter((id) => mine.includes(id));
  assert.deepEqual(new Set(listed), new Set([ended, discontinued, voided]));
  // The day after, the order that ended today has stopped too.
  const tomorrow = (await findUnplannedCareForQueue(prisma, day("2026-10-15")))
    .map((row) => row.animal.id)
    .filter((id) => mine.includes(id));
  assert.deepEqual(new Set(tomorrow), new Set([endsToday, ended, discontinued, voided]));
});

// ---------------------------------------------------------------------------
// findOpenCareEpisodes
// ---------------------------------------------------------------------------

test("the dashboard lists open episodes in care, the latest start first, with where each animal is", async () => {
  const inUnit = await makeAnimal("In the wing", { currentUnitId: medicalUnitId });
  const inUnitEpisode = await openEpisode(inUnit, { startDate: day("2026-10-01") });

  // At the clinic, whatever unit it left behind.
  const offSite = await makeAnimal("At the clinic", { currentUnitId: kennelUnitId });
  const offSiteEpisode = await openEpisode(offSite, {
    type: CareEpisodeType.HOSPITALISED_OFF_SITE,
    startDate: day("2026-10-05"),
    partnerId: clinicId,
  });

  // Same start as the clinic stay, opened later: listed first.
  const fostered = await makeAnimal("In foster");
  await prisma.fosterPlacement.create({
    data: {
      type: FosterPlacementType.GENERAL,
      startDate: "2026-08-10",
      animalId: fostered,
      fosterProfileId,
      placedById: staffId,
    },
  });
  const fosteredEpisode = await openEpisode(fostered, {
    type: CareEpisodeType.UNDER_VET_CARE,
    startDate: day("2026-10-05"),
  });

  const unhoused = await makeAnimal("Not housed");
  const unhousedEpisode = await openEpisode(unhoused, { startDate: day("2026-09-20") });

  const closed = await makeAnimal("Closed list");
  const closedEpisode = await openEpisode(closed, { startDate: day("2026-10-10") });
  await prisma.$transaction((tx) =>
    closeCareEpisode(tx, closedEpisode, day("2026-10-12"), staffId, TODAY),
  );
  const left = await makeAnimal("Left list");
  await openEpisode(left, { startDate: day("2026-10-11") });
  await archive(left);

  const mine = [inUnit, offSite, fostered, unhoused, closed, left];
  const rows = (await findOpenCareEpisodes(prisma, { take: 1000 })).filter((row) =>
    mine.includes(row.animal.id),
  );
  assert.deepEqual(rows, [
    {
      id: fosteredEpisode,
      type: CareEpisodeType.UNDER_VET_CARE,
      startDate: "2026-10-05",
      animal: { id: fostered, name: name("In foster") },
      where: "In foster",
    },
    {
      id: offSiteEpisode,
      type: CareEpisodeType.HOSPITALISED_OFF_SITE,
      startDate: "2026-10-05",
      animal: { id: offSite, name: name("At the clinic") },
      where: name("Care Clinic"),
    },
    {
      id: inUnitEpisode,
      type: CareEpisodeType.HOSPITALISED_IN_HOUSE,
      startDate: "2026-10-01",
      animal: { id: inUnit, name: name("In the wing") },
      where: `${name("Care wing")} · MED-1`,
    },
    {
      id: unhousedEpisode,
      type: CareEpisodeType.HOSPITALISED_IN_HOUSE,
      startDate: "2026-09-20",
      animal: { id: unhoused, name: name("Not housed") },
      where: "Not housed",
    },
  ]);

  assert.ok((await findOpenCareEpisodes(prisma, { take: 2 })).length <= 2);
});
