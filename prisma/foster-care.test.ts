import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { MedicalEntryKind, MedicationDoseResult } from "@/prisma/generated/enums";
import { recordMedicationDose } from "@/app/lib/services/medication-dose";
import { recordFosterTreatment } from "@/app/lib/services/foster-care";
import { recordMedicalEntry, recordScheduledMedicalEntry } from "@/app/lib/services/medical-entry";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import { findFosterMedical } from "@/app/lib/data/fosters/foster-medical";
import { findDoseSheet } from "@/app/lib/data/medication-doses";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { calendarDay as day } from "@/app/lib/utils/shelter-day";
import { ConflictError } from "@/app/lib/utils/errors";
import { updateMedicalItem } from "@/app/lib/services/medical-catalog";

const runId = randomUUID();
const today = day("2026-10-16");
const now = new Date("2026-10-16T16:00:00Z");
let speciesId: string;
let otherSpeciesId: string;
let colorId: string;
let staffId: string;
let fosterId: string;
let strangerId: string;
let profileId: string;
let medicationId: string;
let treatmentId: string;
let vaccineId: string;
let testId: string;

before(async () => {
  const person = async (name: string) => (await prisma.person.create({ data: { name: `${name} ${runId}` } })).id;
  staffId = await person("Private staff name");
  fosterId = await person("Foster");
  strangerId = await person("Stranger");
  profileId = (await prisma.fosterProfile.create({ data: { personId: fosterId, status: "PAUSED", maxAnimals: 50 } })).id;
  speciesId = (await prisma.species.create({ data: { name: `Foster care ${runId}` } })).id;
  otherSpeciesId = (await prisma.species.create({ data: { name: `Other foster care ${runId}` } })).id;
  colorId = (await prisma.color.create({ data: { name: `Foster care ${runId}` } })).id;
  medicationId = (await prisma.medicalItem.create({ data: { kind: "MEDICATION", name: `Medicine ${runId}` } })).id;
  treatmentId = (await prisma.medicalItem.create({ data: {
    kind: "TREATMENT", name: `Dewormer ${runId}`, repeatIntervalDays: 14,
    defaultDoseAmount: 2, defaultDoseUnit: "ML", defaultRoute: "ORAL",
  } })).id;
  vaccineId = (await prisma.medicalItem.create({ data: { kind: "VACCINE", name: `Vaccine ${runId}` } })).id;
  testId = (await prisma.medicalItem.create({ data: { kind: "TEST", name: `Test ${runId}` } })).id;
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  await prisma.fosterPlacement.deleteMany({ where: { fosterProfileId: profileId } });
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.fosterProfile.deleteMany({ where: { id: profileId } });
  await prisma.medicalItem.deleteMany({ where: { name: { endsWith: runId } } });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, fosterId, strangerId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: { in: [speciesId, otherSpeciesId] } } });
  await prisma.$disconnect();
});

const fixture = async (startDate = "2026-10-12") => {
  const animal = await prisma.animal.create({ data: {
    name: `Foster animal ${runId}`, speciesId, primaryColorId: colorId,
    birthDate: "2024-01-01", sex: "FEMALE",
    intake: { create: { type: "STRAY", intakeDate: "2026-09-01", staffMemberId: staffId } },
  } });
  const placement = await prisma.fosterPlacement.create({ data: {
    animalId: animal.id, fosterProfileId: profileId, placedById: staffId,
    type: "GENERAL", startDate,
  } });
  const order = await prisma.medicationOrder.create({ data: {
    animalId: animal.id, itemId: medicationId, doseAmount: 1, doseUnit: "TABLET", route: "ORAL",
    frequency: "BID", startDate: "2026-09-01", firstSlot: "AM", createdById: staffId,
    prescribedBy: "Private prescriber", instructions: "With food",
  } });
  return { animalId: animal.id, placementId: placement.id, orderId: order.id };
};

const scheduled = (animalId: string, kind: MedicalEntryKind = "TREATMENT", itemId: string | null = treatmentId) =>
  prisma.medicalEntry.create({ data: {
    animalId, kind, itemId, status: "SCHEDULED", dueDate: today, createdById: staffId,
    ...(kind === "SURGERY" && { procedure: "SPAY" }),
    ...(kind === "EXAM" && { examType: "VET" }),
  } });

const dose = (orderId: string, result: MedicationDoseResult = "GIVEN", slotDate = today, personId = fosterId) =>
  prisma.$transaction((tx) => recordMedicationDose(tx, {
    orderId, result, slotDate, slot: "AM", ...(result === "NOT_GIVEN" && { reason: "No stock" }),
  }, personId, today, now, { foster: { personId } }));

const treatment = (entryId: string, completedDate = today, personId = fosterId) =>
  prisma.$transaction((tx) => recordFosterTreatment(tx, entryId, { completedDate, notes: "Given with food" }, personId, today));

const refusal = (message: RegExp, field?: string) => (error: unknown) => {
  assert.ok(error instanceof MedicalEntryRefusal);
  assert.match(error.message, message);
  if (field) assert.equal(error.field, field);
  return true;
};

for (const result of Object.values(MedicationDoseResult)) {
  test(`a foster records ${result}, with provenance and the feed's actor`, async () => {
    const { orderId, animalId } = await fixture();
    const { doseId } = await dose(orderId, result);
    const saved = await prisma.medicationDose.findUniqueOrThrow({ where: { id: doseId } });
    assert.equal(saved.result, result);
    assert.equal(saved.reportedByFoster, true);
    assert.equal(saved.administeredById, fosterId);
    assert.equal(saved.createdById, fosterId);
    const sheet = await findDoseSheet(prisma, today, { animalIds: [animalId] });
    assert.equal(sheet.find((row) => row.order.id === orderId)?.doses[0].reportedByFoster, true);
    const logs = await prisma.animalActivityLog.findMany({ where: { animalId } });
    assert.equal(logs.length, result === "GIVEN" ? 0 : 1);
    if (logs.length) assert.equal(logs[0].changedById, fosterId);
  });
}

test("a dose on the placement's first day is allowed, before it is refused", async () => {
  const { orderId } = await fixture();
  await dose(orderId, "GIVEN", day("2026-10-12"));
  await assert.rejects(dose(orderId, "GIVEN", day("2026-10-11")), refusal(/slot was before/));
  assert.equal(await prisma.medicationDose.count({ where: { orderId } }), 1);
});

test("future slots and future administration times are refused", async () => {
  const { orderId } = await fixture();
  await assert.rejects(dose(orderId, "GIVEN", day("2026-10-17")), refusal(/future/));
  await assert.rejects(prisma.$transaction((tx) => recordMedicationDose(tx, {
    orderId, slotDate: today, slot: "AM", result: "GIVEN", administeredAt: new Date(now.getTime() + 1),
  }, fosterId, today, now, { foster: { personId: fosterId } })), refusal(/future/, "administeredAt"));
});

test("another person's animal and a closed placement refuse both writes without saving", async () => {
  const { orderId, animalId, placementId } = await fixture();
  const entry = await scheduled(animalId);
  await assert.rejects(dose(orderId, "GIVEN", today, strangerId), refusal(/isn't in your care/));
  await assert.rejects(treatment(entry.id, today, strangerId), refusal(/isn't in your care/));
  await prisma.fosterPlacement.update({ where: { id: placementId }, data: { endDate: today } });
  await assert.rejects(dose(orderId), refusal(/isn't in your care/));
  await assert.rejects(treatment(entry.id), refusal(/isn't in your care/));
  assert.equal(await prisma.medicationDose.count({ where: { orderId } }), 0);
  assert.equal((await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status, "SCHEDULED");
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), 0);
});

test("recording a repeating treatment uses defaults, audits the foster and plans its next dose", async () => {
  const { animalId } = await fixture();
  const entry = await scheduled(animalId);
  const saved = await treatment(entry.id, day("2026-10-12"));
  const row = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entry.id }, include: { treatment: true, events: true } });
  assert.equal(row.status, "COMPLETED");
  assert.equal(row.source, "IN_HOUSE");
  assert.equal(row.administeredById, fosterId);
  assert.equal(row.reportedByFoster, true);
  assert.equal(row.notes, "Given with food");
  assert.deepEqual([row.treatment?.doseAmount, row.treatment?.doseUnit, row.treatment?.route], [2, "ML", "ORAL"]);
  assert.equal(row.events.length, 1);
  assert.equal(row.events[0].actorId, fosterId);
  assert.equal((row.events[0].after as { reportedByFoster: boolean }).reportedByFoster, true);
  const next = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: saved.nextEntryId! } });
  assert.equal(next.dueDate, "2026-10-26");
  assert.equal(next.status, "SCHEDULED");
  assert.equal(next.reportedByFoster, false);
  const logs = await prisma.animalActivityLog.findMany({ where: { animalId } });
  assert.equal(logs.length, 2);
  assert.ok(logs.every((log) => log.changedById === fosterId));
});

test("the next treatment is due today when the interval has already passed", async () => {
  const { animalId } = await fixture("2026-09-01");
  const entry = await scheduled(animalId);
  const saved = await treatment(entry.id, day("2026-09-01"));
  assert.equal((await prisma.medicalEntry.findUniqueOrThrow({ where: { id: saved.nextEntryId! } })).dueDate, today);
});

test("another open dose suppresses the next one, but voided or completed rows do not", async () => {
  const { animalId } = await fixture();
  const entry = await scheduled(animalId);
  const other = await scheduled(animalId);
  assert.equal((await treatment(entry.id)).nextEntryId, null);
  await prisma.medicalEntry.update({ where: { id: other.id }, data: { voidedAt: now } });
  const third = await scheduled(animalId);
  assert.ok((await treatment(third.id)).nextEntryId);
});

test("non-repeating and retired items can be given without planning another", async () => {
  for (const retired of [false, true]) {
    const item = await prisma.medicalItem.create({ data: {
      kind: "TREATMENT", name: `One-off ${retired} ${runId}`,
      repeatIntervalDays: retired ? 14 : null, retiredAt: retired ? now : null,
    } });
    const { animalId } = await fixture();
    const entry = await scheduled(animalId, "TREATMENT", item.id);
    assert.equal((await treatment(entry.id)).nextEntryId, null);
  }
});

for (const eligibility of ["matching", "mixed", "other species"] as const) {
  test(`an existing treatment records with ${eligibility} eligibility, scheduling next only when still pickable`, async () => {
    const item = await prisma.medicalItem.create({ data: {
      kind: "TREATMENT", name: `Narrowed ${eligibility} ${runId}`, repeatIntervalDays: 14,
      defaultDoseAmount: 2, defaultDoseUnit: "ML", defaultRoute: "ORAL",
      species: { connect: { id: speciesId } },
    } });
    const { animalId } = await fixture();
    const entry = await scheduled(animalId, "TREATMENT", item.id);
    const speciesIds = eligibility === "matching" ? [speciesId]
      : eligibility === "mixed" ? [speciesId, otherSpeciesId] : [otherSpeciesId];
    await prisma.$transaction((tx) => updateMedicalItem(tx, item.id, {
      kind: "TREATMENT", name: item.name, speciesIds, analytes: [], repeatIntervalDays: 14,
      defaultDoseAmount: 2, defaultDoseUnit: "ML", defaultRoute: "ORAL",
    }));
    const saved = await treatment(entry.id);
    assert.equal(saved.nextEntryId !== null, eligibility !== "other species");
    const recorded = await prisma.medicalEntry.findUniqueOrThrow({
      where: { id: entry.id }, include: { treatment: true, events: true },
    });
    assert.equal(recorded.status, "COMPLETED");
    assert.equal(recorded.reportedByFoster, true);
    assert.equal(recorded.administeredById, fosterId);
    assert.deepEqual([recorded.treatment?.doseAmount, recorded.treatment?.doseUnit, recorded.treatment?.route], [2, "ML", "ORAL"]);
    assert.equal(recorded.events[0].action, "COMPLETED");
    assert.equal(await prisma.medicalEntry.count({ where: { animalId, status: "SCHEDULED" } }), eligibility === "other species" ? 0 : 1);
  });
}

for (const change of ["retirement", "species change"] as const) {
  test(`a treatment waiting on a catalog ${change} rereads its eligibility before recording`, async () => {
    const item = await prisma.medicalItem.create({ data: {
      kind: "TREATMENT", name: `Changing treatment ${change} ${runId}`, repeatIntervalDays: 14,
      species: { connect: { id: speciesId } },
    } });
    const { animalId } = await fixture();
    const entry = await scheduled(animalId, "TREATMENT", item.id);
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    let held!: (pid: number) => void;
    const holding = new Promise<number>((resolve) => { held = resolve; });
    const changing = prisma.$transaction(async (tx) => {
      if (change === "retirement") {
        await tx.medicalItem.update({ where: { id: item.id }, data: { retiredAt: now } });
      } else {
        await updateMedicalItem(tx, item.id, {
          kind: "TREATMENT", name: item.name, speciesIds: [otherSpeciesId], analytes: [], repeatIntervalDays: 14,
        });
      }
      held(await backendPid(tx));
      await released;
    });
    const holderPid = await holding;
    let started!: (pid: number) => void;
    const starting = new Promise<number>((resolve) => { started = resolve; });
    const recording = prisma.$transaction(async (tx) => {
      started(await backendPid(tx));
      return recordFosterTreatment(tx, entry.id, { completedDate: today }, fosterId, today);
    });
    void recording.catch(() => {});
    try {
      await waitForBlockedBy(await starting, holderPid);
    } finally {
      release();
      await Promise.allSettled([changing, recording]);
    }
    await changing;
    assert.equal((await recording).nextEntryId, null);
    assert.equal((await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status, "COMPLETED");
  });
}

for (const kind of ["VACCINE", "TEST", "EXAM", "SURGERY", "MICROCHIP"] as const) {
  test(`a foster cannot record a scheduled ${kind}`, async () => {
    const { animalId } = await fixture();
    const entry = await scheduled(animalId, kind, kind === "VACCINE" ? vaccineId : kind === "TEST" ? testId : null);
    await assert.rejects(treatment(entry.id), refusal(/Only a scheduled treatment/));
    assert.equal(await prisma.medicalEntryEvent.count({ where: { entryId: entry.id } }), 0);
  });
}

test("a treatment's day must be within the placement and no later than today", async () => {
  const { animalId } = await fixture();
  const entry = await scheduled(animalId);
  await assert.rejects(treatment(entry.id, day("2026-10-11")), refusal(/before.*placed with you/, "completedDate"));
  await assert.rejects(treatment(entry.id, day("2026-10-17")), refusal(/future/, "completedDate"));
});

test("a treatment already given, declined or voided cannot be given again", async () => {
  const { animalId } = await fixture();
  for (const state of ["COMPLETED", "DECLINED", "VOIDED"]) {
    const entry = await scheduled(animalId);
    await prisma.medicalEntry.update({ where: { id: entry.id }, data: state === "VOIDED" ? { voidedAt: now } : { status: state as "COMPLETED" | "DECLINED" } });
    await assert.rejects(treatment(entry.id), ConflictError);
  }
});

test("ordinary staff dose and treatment keep their original provenance", async () => {
  const { animalId, orderId } = await fixture();
  const saved = await prisma.$transaction((tx) => recordMedicationDose(tx, {
    orderId, slot: "AM", slotDate: today, result: "GIVEN",
  }, staffId, today, now));
  assert.equal((await prisma.medicationDose.findUniqueOrThrow({ where: { id: saved.doseId } })).reportedByFoster, false);
  const entry = await scheduled(animalId);
  await prisma.$transaction((tx) => recordScheduledMedicalEntry(tx, entry.id, {
    kind: "TREATMENT", itemId: treatmentId, completedDate: today, source: "IN_HOUSE",
  }, staffId, today));
  assert.equal((await prisma.medicalEntry.findUniqueOrThrow({ where: { id: entry.id } })).reportedByFoster, false);
});

test("the entry writer keeps foster provenance on care recorded on its own too", async () => {
  const { animalId } = await fixture();
  const saved = await prisma.$transaction((tx) => recordMedicalEntry(tx, {
    animalId, kind: "TREATMENT", itemId: treatmentId, completedDate: today, source: "IN_HOUSE",
  }, staffId, today, { reportedByFoster: true }));
  const entry = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: saved.entryId }, include: { events: true } });
  assert.equal(entry.reportedByFoster, true);
  assert.equal((entry.events[0].after as { reportedByFoster: boolean }).reportedByFoster, true);
});

test("a foster read is absent without an open placement", async () => {
  const { animalId, placementId } = await fixture();
  const clock = { day: today, time: "12:00" };
  assert.equal(await findFosterMedical(prisma, strangerId, animalId, clock), null);
  assert.equal(await findFosterMedical(prisma, "", animalId, clock), null);
  await prisma.fosterPlacement.update({ where: { id: placementId }, data: { endDate: today } });
  assert.equal(await findFosterMedical(prisma, fosterId, animalId, clock), null);
});

test("the foster read limits slots and identities, hides voids, and marks only treatments recordable", async () => {
  const { animalId, orderId } = await fixture();
  await scheduled(animalId);
  await scheduled(animalId, "VACCINE", vaccineId);
  const hidden = await scheduled(animalId);
  await prisma.medicalEntry.update({ where: { id: hidden.id }, data: { voidedAt: now } });
  for (const [slotDate, actor, voidedAt] of [
    ["2026-10-11", staffId, null], ["2026-10-12", staffId, null],
    ["2026-10-13", fosterId, null], ["2026-10-14", staffId, now],
  ] as const) {
    await prisma.medicationDose.create({ data: {
      animalId, orderId, slotDate, slot: "AM", result: "GIVEN", administeredAt: now,
      administeredById: actor, createdById: actor, voidedAt, reportedByFoster: actor === fosterId,
    } });
  }
  for (const state of ["ACTIVE", "CHRONIC", "RESOLVED", "VOIDED"] as const) {
    await prisma.medicalCondition.create({ data: {
      animalId, type: "ALLERGY", name: state, status: state === "VOIDED" ? "ACTIVE" : state,
      createdById: staffId, diagnosedBy: "Private diagnostician", ...(state === "VOIDED" && { voidedAt: now }),
    } });
  }
  for (const voidedAt of [null, now]) {
    await prisma.medicalDocument.create({ data: {
      animalId, name: voidedAt ? "Hidden document" : "Live document", type: "VET_RECORD",
      pathname: randomUUID(), contentType: "application/pdf", sizeBytes: 20, uploadedById: staffId, voidedAt,
    } });
    await prisma.medicalEntry.create({ data: {
      animalId, kind: "VACCINE", itemId: vaccineId, status: "COMPLETED", completedDate: today,
      source: "OUTSIDE_VET", administeredById: staffId, createdById: staffId, voidedAt,
    } });
  }
  const data = await findFosterMedical(prisma, fosterId, animalId, { day: today, time: "12:00" });
  assert.ok(data);
  assert.deepEqual(data.alerts.map((alert) => alert.name), ["ACTIVE", "CHRONIC"]);
  assert.equal(data.due.length, 2);
  assert.equal(data.due.filter((entry) => entry.recordable).length, 1);
  assert.deepEqual(data.documents.map((document) => document.name), ["Live document"]);
  assert.equal(data.given.length, 1);
  assert.equal(data.given[0].source, "Outside vet");
  assert.deepEqual(data.orders[0].days.map(({ day }) => day), ["2026-10-16", "2026-10-15", "2026-10-14", "2026-10-13", "2026-10-12"]);
  const doses = data.orders[0].days.flatMap(({ slots }) => slots.flatMap((slot) => slot.doses));
  assert.deepEqual(doses.map((dose) => dose.givenBy), ["You", "The shelter"]);
  assert.ok(data.orders[0].days.every(({ slots }) => slots.every((slot) => slot.voidedDoses.length === 0)));
  const serialized = JSON.stringify(data);
  for (const privateValue of [staffId, fosterId, "Private staff name", "Private prescriber", "Private diagnostician", "events", "Hidden document"]) assert.ok(!serialized.includes(privateValue), privateValue);
});

test("the dose range stops at the past week even for a long placement", async () => {
  const { animalId } = await fixture("2026-09-01");
  const data = await findFosterMedical(prisma, fosterId, animalId, { day: today, time: "12:00" });
  assert.ok(data);
  assert.equal(data.orders[0].days.at(-1)?.day, "2026-10-09");
});

test("only active orders appear, including as-needed care with days ready to record", async () => {
  const { animalId, orderId } = await fixture();
  const base = await prisma.medicationOrder.findUniqueOrThrow({ where: { id: orderId } });
  for (const changes of [
    { endDate: "2026-10-15" }, { discontinuedDate: today },
    { voidedAt: now }, { startDate: "2026-10-17" },
    { frequency: "PRN" as const, firstSlot: null },
  ]) {
    const { id: _id, ...copy } = base;
    await prisma.medicationOrder.create({ data: { ...copy, ...changes } });
  }
  const data = await findFosterMedical(prisma, fosterId, animalId, { day: today, time: "12:00" });
  assert.ok(data);
  assert.equal(data.orders.length, 2);
  const asNeeded = data.orders.find((order) => order.days[0].slots[0].slot === null);
  assert.ok(asNeeded);
  assert.ok(asNeeded.days.every(({ slots }) => slots[0].recordable));
});

test("test analyte results are readable without the recorder's identity", async () => {
  const { animalId } = await fixture();
  const analyte = await prisma.medicalItemAnalyte.create({ data: { itemId: testId, name: `Antigen ${runId}`, sortOrder: 0 } });
  await prisma.medicalEntry.create({ data: {
    animalId, kind: "TEST", itemId: testId, status: "COMPLETED", completedDate: today,
    source: "IN_HOUSE", createdById: staffId,
    test: { create: { results: { create: { analyteId: analyte.id, analyteName: "Antigen", result: "NEGATIVE" } } } },
  } });
  const data = await findFosterMedical(prisma, fosterId, animalId, { day: today, time: "12:00" });
  assert.ok(data);
  assert.deepEqual(data.given[0].results, [{ analyteName: "Antigen", result: "NEGATIVE" }]);
  assert.equal(data.given[0].source, "Shelter");
});

for (const write of ["dose", "treatment"] as const) {
  test(`a ${write} waiting on a return's animal lock rechecks the closed placement`, async () => {
    const { animalId, placementId, orderId } = await fixture();
    const entry = await scheduled(animalId);
    let unlock!: () => void;
    let locked!: (pid: number) => void;
    const held = new Promise<number>((resolve) => { locked = resolve; });
    const release = new Promise<void>((resolve) => { unlock = resolve; });
    const returning = prisma.$transaction(async (tx) => {
      await lockAnimal(tx, animalId);
      await tx.fosterPlacement.update({ where: { id: placementId }, data: { endDate: today } });
      locked(await backendPid(tx));
      await release;
    });
    const holderPid = await held;
    let started!: (pid: number) => void;
    const starting = new Promise<number>((resolve) => { started = resolve; });
    const writing = prisma.$transaction(async (tx) => {
      started(await backendPid(tx));
      return write === "dose"
        ? recordMedicationDose(tx, { orderId, result: "GIVEN", slotDate: today, slot: "AM" }, fosterId, today, now, { foster: { personId: fosterId } })
        : recordFosterTreatment(tx, entry.id, { completedDate: today }, fosterId, today);
    });
    void writing.catch(() => {});
    try {
      const waiterPid = await starting;
      await waitForBlockedBy(waiterPid, holderPid);
    } finally {
      unlock();
      await Promise.allSettled([returning, writing]);
    }
    await returning;
    await assert.rejects(writing, refusal(/isn't in your care/));
    assert.equal(await prisma.medicationDose.count({ where: { animalId } }), 0);
    assert.equal(await prisma.medicalEntryEvent.count({ where: { entryId: entry.id } }), 0);
  });
}

const backendPid = async (tx: TransactionClient) => {
  const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  return row.pid;
};

const waitForBlockedBy = async (waiter: number, holder: number) => {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`SELECT ${holder}::int = ANY(pg_blocking_pids(${waiter}::int)) AS blocked`;
    if (row.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The foster write did not wait on the animal's lock.");
};
