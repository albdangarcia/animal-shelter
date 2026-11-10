// Care given by an outside vet names the vet, against a real Postgres: a
// clinic from the partner directory, a typed name, or both. Every path that
// writes a source and a vet is held to it, when care is recorded and when an
// entry is edited, and a refusal leaves no row behind: recording care nobody
// scheduled, recording care that was, editing, batches of either, and care
// recorded from a foster's vet visit report.
//
// The services here are the whole of each action bar the session check and
// the cache invalidation, so driving them is driving the actions.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalEntryStatus,
} from "@/prisma/generated/enums";
import {
  editMedicalEntry,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
  type TreatmentEntryInput,
} from "@/app/lib/services/medical-entry";
import {
  MedicalBatchRefusal,
  recordMedicalBatch,
  recordScheduledMedicalBatch,
} from "@/app/lib/services/medical-batch";
import { submitVetVisitReport } from "@/app/lib/services/vet-visit-report";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import { OUTSIDE_VET_NEEDS_VET } from "@/app/lib/constants/medical";
import { calendarDay as day } from "@/app/lib/utils/shelter-day";

const runId = randomUUID();
const TODAY = day("2026-10-16");
const GIVEN = day("2026-10-14");
const name = (value: string) => `${value} ${runId}`;

let speciesId: string;
let colorId: string;
let staffId: string;
let fosterId: string;
let profileId: string;
let clinicId: string;
let dewormerId: string;

before(async () => {
  staffId = (await prisma.person.create({ data: { name: name("Outside vet staff") } })).id;
  fosterId = (await prisma.person.create({ data: { name: name("Outside vet foster") } })).id;
  profileId = (
    await prisma.fosterProfile.create({ data: { personId: fosterId, maxAnimals: 50 } })
  ).id;
  speciesId = (await prisma.species.create({ data: { name: name("Outside vet species") } })).id;
  colorId = (await prisma.color.create({ data: { name: name("Outside vet color") } })).id;
  clinicId = (
    await prisma.partner.create({ data: { name: name("Clinic"), type: "VET_CLINIC" } })
  ).id;
  dewormerId = (
    await prisma.medicalItem.create({ data: { name: name("Dewormer"), kind: "TREATMENT" } })
  ).id;
});

after(async () => {
  const where = { animal: { speciesId } };
  await prisma.medicalEntry.deleteMany({ where });
  await prisma.vetVisitReport.deleteMany({ where });
  await prisma.fosterPlacement.deleteMany({ where });
  await prisma.intake.deleteMany({ where });
  // Takes the activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.fosterProfile.deleteMany({ where: { id: profileId } });
  await prisma.medicalItem.deleteMany({ where: { id: dewormerId } });
  await prisma.partner.deleteMany({ where: { id: clinicId } });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, fosterId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        speciesId,
        primaryColorId: colorId,
        birthDate: "2024-01-01",
        sex: "FEMALE",
        intake: { create: { intakeDate: "2026-09-01", type: "STRAY", staffMemberId: staffId } },
      },
      select: { id: true },
    })
  ).id;

type Vet = Pick<TreatmentEntryInput, "source" | "vetPartnerId" | "vetName">;

const OUTSIDE = MedicalEntrySource.OUTSIDE_VET;
// Neither a clinic nor a name, however it is left blank.
const NO_VET: Vet[] = [
  { source: OUTSIDE },
  { source: OUTSIDE, vetPartnerId: null, vetName: null },
  { source: OUTSIDE, vetPartnerId: "", vetName: "   " },
];

const dewormer = (vet: Vet, extra: Partial<TreatmentEntryInput> = {}): TreatmentEntryInput => ({
  kind: MedicalEntryKind.TREATMENT,
  itemId: dewormerId,
  completedDate: GIVEN,
  ...vet,
  ...extra,
});

const record = (animalId: string, input: TreatmentEntryInput, vetReportId?: string) =>
  prisma.$transaction((tx) =>
    recordMedicalEntry(tx, { ...input, animalId }, staffId, TODAY, { vetReportId }),
  );

const recordScheduled = (entryId: string, input: TreatmentEntryInput, vetReportId?: string) =>
  prisma.$transaction((tx) =>
    recordScheduledMedicalEntry(tx, entryId, input, staffId, TODAY, { vetReportId }),
  );

const edit = (entryId: string, input: TreatmentEntryInput) =>
  prisma.$transaction((tx) => editMedicalEntry(tx, entryId, input, staffId, TODAY));

const schedule = async (animalId: string) =>
  (
    await prisma.medicalEntry.create({
      data: {
        animalId,
        kind: "TREATMENT",
        itemId: dewormerId,
        status: "SCHEDULED",
        dueDate: TODAY,
        createdById: staffId,
      },
      select: { id: true },
    })
  ).id;

const readEntry = (entryId: string) =>
  prisma.medicalEntry.findUniqueOrThrow({ where: { id: entryId } });

const completedOf = (animalId: string) =>
  prisma.medicalEntry.count({ where: { animalId, status: MedicalEntryStatus.COMPLETED } });

const activityOf = (animalId: string) =>
  prisma.animalActivityLog.count({ where: { animalId } });

/** Refused with the outside vet message, on the vet's name field. */
const refusedForNoVet = (promise: Promise<unknown>) =>
  assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof MedicalEntryRefusal, String(error));
    assert.ok(!(error instanceof MedicalBatchRefusal));
    assert.equal(error.message, OUTSIDE_VET_NEEDS_VET);
    assert.equal(error.field, "vetName");
    return true;
  });

// ---------------------------------------------------------------------------
// Recording care nobody scheduled
// ---------------------------------------------------------------------------

test("care by an outside vet with no clinic and no name is refused, and nothing is written", async () => {
  const animalId = await makeAnimal("Record refused");
  for (const vet of NO_VET) {
    await refusedForNoVet(record(animalId, dewormer(vet)));
  }
  assert.equal(await completedOf(animalId), 0);
  assert.equal(await activityOf(animalId), 0);
});

test("care by an outside vet names a clinic, the vet, or both", async () => {
  const animalId = await makeAnimal("Record accepted");
  const clinic = await record(animalId, dewormer({ source: OUTSIDE, vetPartnerId: clinicId }));
  assert.equal((await readEntry(clinic.entryId)).vetPartnerId, clinicId);

  const named = await record(animalId, dewormer({ source: OUTSIDE, vetName: "  Dr. Patel  " }));
  const namedRow = await readEntry(named.entryId);
  assert.equal(namedRow.vetPartnerId, null);
  assert.equal(namedRow.vetName, "Dr. Patel");

  const both = await record(
    animalId,
    dewormer({ source: OUTSIDE, vetPartnerId: clinicId, vetName: "Dr. Patel" }),
  );
  const bothRow = await readEntry(both.entryId);
  assert.equal(bothRow.vetPartnerId, clinicId);
  assert.equal(bothRow.vetName, "Dr. Patel");
});

test("in house care still refuses a vet, and care before intake needs none", async () => {
  const animalId = await makeAnimal("Other sources");
  await assert.rejects(
    record(animalId, dewormer({ source: MedicalEntrySource.IN_HOUSE, vetName: "Dr. Patel" })),
    (error: unknown) => error instanceof MedicalEntryRefusal && error.field === "vetName",
  );
  await assert.rejects(
    record(animalId, dewormer({ source: MedicalEntrySource.IN_HOUSE, vetPartnerId: clinicId })),
    (error: unknown) => error instanceof MedicalEntryRefusal && error.field === "vetPartnerId",
  );
  await record(animalId, dewormer({ source: MedicalEntrySource.IN_HOUSE }));
  await record(
    animalId,
    dewormer({ source: MedicalEntrySource.BEFORE_INTAKE }, { completedDate: day("2026-08-15") }),
  );
  assert.equal(await completedOf(animalId), 2);
});

// ---------------------------------------------------------------------------
// Recording care that was scheduled
// ---------------------------------------------------------------------------

test("scheduled care recorded as given by an outside vet with no vet is refused, and stays scheduled", async () => {
  const animalId = await makeAnimal("Scheduled refused");
  const entryId = await schedule(animalId);
  for (const vet of NO_VET) {
    await refusedForNoVet(recordScheduled(entryId, dewormer(vet)));
  }
  const entry = await readEntry(entryId);
  assert.equal(entry.status, MedicalEntryStatus.SCHEDULED);
  assert.equal(entry.source, null);
  assert.equal(await activityOf(animalId), 0);
});

test("scheduled care recorded as given by an outside vet keeps its clinic and name", async () => {
  const animalId = await makeAnimal("Scheduled accepted");
  const entryId = await schedule(animalId);
  await recordScheduled(
    entryId,
    dewormer({ source: OUTSIDE, vetPartnerId: clinicId, vetName: "Dr. Patel" }),
  );
  const entry = await readEntry(entryId);
  assert.equal(entry.status, MedicalEntryStatus.COMPLETED);
  assert.equal(entry.vetPartnerId, clinicId);
  assert.equal(entry.vetName, "Dr. Patel");
});

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

test("an edit that takes the clinic off outside vet care, naming nobody, is refused", async () => {
  const animalId = await makeAnimal("Edit drops clinic");
  const { entryId } = await record(animalId, dewormer({ source: OUTSIDE, vetPartnerId: clinicId }));
  // An edit that leaves the vet out keeps the stored one, so only clearing
  // it counts.
  for (const vet of NO_VET.slice(1)) {
    await refusedForNoVet(edit(entryId, dewormer(vet)));
  }
  assert.equal((await readEntry(entryId)).vetPartnerId, clinicId);
  await edit(entryId, dewormer({ source: OUTSIDE }, { notes: "Kept its clinic." }));
  assert.equal((await readEntry(entryId)).vetPartnerId, clinicId);

  // Swapping the clinic for a name is fine.
  await edit(entryId, dewormer({ source: OUTSIDE, vetPartnerId: null, vetName: "Dr. Patel" }));
  const entry = await readEntry(entryId);
  assert.equal(entry.vetPartnerId, null);
  assert.equal(entry.vetName, "Dr. Patel");
});

test("an edit that moves care to an outside vet must name the vet", async () => {
  for (const source of [MedicalEntrySource.IN_HOUSE, MedicalEntrySource.BEFORE_INTAKE]) {
    const animalId = await makeAnimal(`Edit moves ${source}`);
    const completedDate = source === MedicalEntrySource.BEFORE_INTAKE ? day("2026-08-15") : GIVEN;
    const { entryId } = await record(animalId, dewormer({ source }, { completedDate }));
    await refusedForNoVet(edit(entryId, dewormer({ source: OUTSIDE })));
    assert.equal((await readEntry(entryId)).source, source);

    await edit(entryId, dewormer({ source: OUTSIDE, vetName: "Dr. Patel" }));
    const entry = await readEntry(entryId);
    assert.equal(entry.source, OUTSIDE);
    assert.equal(entry.vetName, "Dr. Patel");
  }
});

test("outside vet care saved with no vet must gain one on its next edit, though its clinic is unchanged", async () => {
  const animalId = await makeAnimal("Edit legacy");
  const { entryId } = await record(animalId, dewormer({ source: OUTSIDE, vetPartnerId: clinicId }));
  // As a row saved before the rule would be.
  await prisma.medicalEntry.update({ where: { id: entryId }, data: { vetPartnerId: null } });

  // Only the notes change, so the clinic short-cut would have skipped it.
  await refusedForNoVet(edit(entryId, dewormer({ source: OUTSIDE }, { notes: "Given with food." })));
  assert.equal((await readEntry(entryId)).notes, null);

  const result = await edit(
    entryId,
    dewormer({ source: OUTSIDE, vetName: "Dr. Patel" }, { notes: "Given with food." }),
  );
  assert.equal(result.status, "edited");
  const entry = await readEntry(entryId);
  assert.equal(entry.vetName, "Dr. Patel");
  assert.equal(entry.notes, "Given with food.");
});

test("an edit that keeps an outside vet's clinic, or care before intake with no vet, passes", async () => {
  const animalId = await makeAnimal("Edit keeps");
  const outside = await record(animalId, dewormer({ source: OUTSIDE, vetPartnerId: clinicId }));
  await edit(
    outside.entryId,
    dewormer({ source: OUTSIDE, vetPartnerId: clinicId }, { notes: "Given with food." }),
  );
  assert.equal((await readEntry(outside.entryId)).notes, "Given with food.");

  const beforeIntake = dewormer(
    { source: MedicalEntrySource.BEFORE_INTAKE },
    { completedDate: day("2026-08-15") },
  );
  const prior = await record(animalId, beforeIntake);
  await edit(prior.entryId, { ...beforeIntake, notes: "From the previous owner." });
  assert.equal((await readEntry(prior.entryId)).notes, "From the previous owner.");
});

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

test("a batch given by an outside vet with no vet is refused once, on the vet's field, and writes nothing", async () => {
  const animalIds = [await makeAnimal("Batch one"), await makeAnimal("Batch two")];
  for (const vet of NO_VET) {
    await refusedForNoVet(
      prisma.$transaction((tx) =>
        recordMedicalBatch(
          tx,
          {
            mode: "RECORD",
            animals: animalIds.map((animalId) => ({ animalId })),
            entry: dewormer(vet),
          },
          staffId,
          TODAY,
        ),
      ),
    );
  }
  for (const animalId of animalIds) {
    assert.equal(await completedOf(animalId), 0);
    assert.equal(await activityOf(animalId), 0);
  }

  const { entries } = await prisma.$transaction((tx) =>
    recordMedicalBatch(
      tx,
      {
        mode: "RECORD",
        animals: animalIds.map((animalId) => ({ animalId })),
        entry: dewormer({ source: OUTSIDE, vetName: " Dr. Lee " }),
      },
      staffId,
      TODAY,
    ),
  );
  assert.equal(entries.length, 2);
  for (const { entryId } of entries) {
    assert.equal((await readEntry(entryId)).vetName, "Dr. Lee");
  }
});

test("scheduled entries recorded together by an outside vet with no vet are refused, and stay scheduled", async () => {
  const animalIds = [await makeAnimal("Scheduled batch one"), await makeAnimal("Scheduled batch two")];
  const entryIds = await Promise.all(animalIds.map(schedule));
  const { itemId: _itemId, ...details } = dewormer({ source: OUTSIDE });
  for (const vet of NO_VET) {
    await refusedForNoVet(
      prisma.$transaction((tx) =>
        recordScheduledMedicalBatch(
          tx,
          { entries: entryIds.map((entryId) => ({ entryId })), details: { ...details, ...vet } },
          staffId,
          TODAY,
        ),
      ),
    );
  }
  for (const entryId of entryIds) {
    assert.equal((await readEntry(entryId)).status, MedicalEntryStatus.SCHEDULED);
  }

  await prisma.$transaction((tx) =>
    recordScheduledMedicalBatch(
      tx,
      {
        entries: entryIds.map((entryId) => ({ entryId })),
        details: { ...details, vetPartnerId: clinicId },
      },
      staffId,
      TODAY,
    ),
  );
  for (const entryId of entryIds) {
    const entry = await readEntry(entryId);
    assert.equal(entry.status, MedicalEntryStatus.COMPLETED);
    assert.equal(entry.vetPartnerId, clinicId);
  }
});

// ---------------------------------------------------------------------------
// Care recorded from a foster's vet visit report
// ---------------------------------------------------------------------------

const withReport = async (label: string) => {
  const animalId = await makeAnimal(label);
  await prisma.fosterPlacement.create({
    data: {
      animalId,
      fosterProfileId: profileId,
      placedById: staffId,
      type: "GENERAL",
      startDate: "2026-10-11",
    },
  });
  const { reportId } = await prisma.$transaction((tx) =>
    submitVetVisitReport(
      tx,
      { animalId, visitDate: GIVEN, vetName: "Dr. Patel", summary: "Dewormed at the clinic." },
      fosterId,
      TODAY,
    ),
  );
  return { animalId, reportId };
};

test("care recorded from a foster's report must name the vet, scheduled or not, and the report keeps waiting", async () => {
  const { animalId, reportId } = await withReport("Report refused");
  const entryId = await schedule(animalId);
  for (const vet of NO_VET) {
    await refusedForNoVet(record(animalId, dewormer(vet), reportId));
    await refusedForNoVet(recordScheduled(entryId, dewormer(vet), reportId));
  }
  assert.equal(await completedOf(animalId), 0);
  assert.equal(
    (await prisma.vetVisitReport.findUniqueOrThrow({ where: { id: reportId } })).reviewedAt,
    null,
  );
});

test("care recorded from a foster's report with the vet named keeps the vet and the report", async () => {
  const { animalId, reportId } = await withReport("Report accepted");
  const adHoc = await record(animalId, dewormer({ source: OUTSIDE, vetName: "Dr. Patel" }), reportId);
  const entryId = await schedule(animalId);
  await recordScheduled(entryId, dewormer({ source: OUTSIDE, vetPartnerId: clinicId }), reportId);
  for (const id of [adHoc.entryId, entryId]) {
    const entry = await readEntry(id);
    assert.equal(entry.vetReportId, reportId);
    assert.equal(entry.reportedByFoster, true);
  }
  assert.equal((await readEntry(adHoc.entryId)).vetName, "Dr. Patel");
  assert.equal((await readEntry(entryId)).vetPartnerId, clinicId);
});
