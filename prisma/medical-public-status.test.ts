import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { PUBLIC_MEDICAL_FACTS_SELECT, publicMedicalFacts } from "@/app/lib/data/animals/medical-status";

const run = randomUUID();
let speciesId: string, colorId: string, actorId: string, itemId: string, profileId: string;
before(async () => {
  speciesId = (await prisma.species.create({ data: { name: `Public species ${run}` } })).id;
  colorId = (await prisma.color.create({ data: { name: `Public color ${run}` } })).id;
  actorId = (await prisma.person.create({ data: { name: `PRIVATE ACTOR ${run}` } })).id;
  itemId = (await prisma.medicalItem.create({ data: { kind: "VACCINE", name: `PRIVATE PRODUCT ${run}`, isRabies: true } })).id;
  profileId = (await prisma.fosterProfile.create({ data: { personId: actorId } })).id;
});
after(async () => {
  const animals = await prisma.animal.findMany({ where: { speciesId }, select: { id: true } });
  const animalId = { in: animals.map((a) => a.id) };
  await prisma.medicalEntry.deleteMany({ where: { animalId } });
  await prisma.vetVisitReport.deleteMany({ where: { animalId } });
  await prisma.fosterPlacement.deleteMany({ where: { animalId } });
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.fosterProfile.delete({ where: { id: profileId } });
  await prisma.medicalItem.delete({ where: { id: itemId } });
  await prisma.person.delete({ where: { id: actorId } });
  await prisma.species.delete({ where: { id: speciesId } });
  await prisma.color.delete({ where: { id: colorId } });
  await prisma.$disconnect();
});
const animal = () => prisma.animal.create({ data: { name: `Public animal ${run}`, birthDate: "2020-01-01", sex: "UNKNOWN", speciesId, primaryColorId: colorId, listingStatus: "PUBLISHED" } });
const entry = (animalId: string, data: Partial<Prisma.MedicalEntryUncheckedCreateInput> = {}) => prisma.medicalEntry.create({ data: {
  animalId, kind: "VACCINE", status: "COMPLETED", source: "BEFORE_INTAKE", completedDate: null, itemId,
  notes: "PRIVATE NOTES", createdById: actorId, ...data,
} });
const read = async (animalId: string) => {
  const a = await prisma.animal.findUniqueOrThrow({ where: { id: animalId }, select: { medicalEntries: PUBLIC_MEDICAL_FACTS_SELECT } });
  return publicMedicalFacts(a.medicalEntries);
};
const none = { isAltered: false, hasMicrochip: false, hasRecordedVaccination: false };

test("only completed live vaccines establish the positive fact, including an unknown before-intake day", async () => {
  for (const [status, voidedAt, expected] of [
    ["SCHEDULED", null, false], ["DECLINED", null, false],
    ["COMPLETED", new Date(), false], ["COMPLETED", null, true],
  ] as const) {
    const a = await animal();
    await entry(a.id, { status, voidedAt, dueDate: status === "SCHEDULED" ? "2026-10-17" : null });
    assert.deepEqual(await read(a.id), { ...none, hasRecordedVaccination: expected });
  }
  const a = await animal();
  await entry(a.id, { completedDate: "2026-01-01", source: "OUTSIDE_VET" });
  assert.equal((await read(a.id)).hasRecordedVaccination, true);
  const blank = await animal();
  assert.deepEqual(await read(blank.id), none);
});

test("catalog retirement, name, rabies flag and stored expiry never turn the fact into a coverage policy", async () => {
  const a = await animal();
  await entry(a.id, { completedDate: "2020-01-01", vaccine: { create: { durationMonths: 12, validUntilDate: "2021-01-01", veterinarianName: "PRIVATE VET", veterinarianLicenseNumber: "PRIVATE LICENSE" } } });
  await prisma.medicalItem.update({ where: { id: itemId }, data: { isRabies: false, retiredAt: new Date(), name: `PRIVATE RENAMED ${run}` } });
  assert.deepEqual(await read(a.id), { ...none, hasRecordedVaccination: true });
});

test("a raw foster visit is not care; its staff-recorded vaccination counts even after a source correction", async () => {
  const a = await animal();
  const placement = await prisma.fosterPlacement.create({ data: { animalId: a.id, fosterProfileId: profileId, startDate: "2026-01-01", type: "GENERAL", placedById: actorId } });
  const report = await prisma.vetVisitReport.create({ data: { animalId: a.id, placementId: placement.id, reportedById: actorId, visitDate: "2026-01-02", summary: "PRIVATE RAW REPORT", vetName: "PRIVATE CLINIC" } });
  assert.deepEqual(await read(a.id), none);
  const e = await entry(a.id, { vetReportId: report.id, source: "OUTSIDE_VET", completedDate: "2026-01-02", reportedByFoster: true });
  assert.equal((await read(a.id)).hasRecordedVaccination, true);
  await prisma.medicalEntry.update({ where: { id: e.id }, data: { source: "IN_HOUSE" } });
  assert.equal((await read(a.id)).hasRecordedVaccination, true);
  await prisma.medicalEntry.update({ where: { id: e.id }, data: { voidedAt: new Date() } });
  assert.deepEqual(await read(a.id), none);
});

test("chip registration never changes the public chip fact, and planned or voided chips do not count", async () => {
  for (const registrationStatus of ["UNKNOWN", "NOT_REGISTERED", "PENDING", "REGISTERED"] as const) {
    const a = await animal();
    await entry(a.id, { kind: "MICROCHIP", itemId: null, chipNumber: `PRIVATE-${randomUUID()}`, microchip: { create: {
      registrationStatus, registryName: registrationStatus === "REGISTERED" ? "PRIVATE REGISTRY" : null,
      registrationDate: registrationStatus === "REGISTERED" ? "2026-01-01" : null, registrationNotes: "PRIVATE REGISTRATION NOTES",
    } } });
    assert.deepEqual(await read(a.id), { ...none, hasMicrochip: true });
  }
  const a = await animal();
  await entry(a.id, { kind: "MICROCHIP", itemId: null, status: "SCHEDULED", dueDate: "2026-10-17" });
  await entry(a.id, { kind: "MICROCHIP", itemId: null, chipNumber: `PRIVATE-${randomUUID()}`, voidedAt: new Date() });
  assert.deepEqual(await read(a.id), none);
});

test("an exemption, reproductive observation, test and treatment do not imply altered or vaccinated", async () => {
  const a = await animal();
  await entry(a.id, { kind: "SURGERY", itemId: null, procedure: "SPAY", status: "DECLINED", source: null, exemptionReason: "MEDICAL_RISK" });
  await entry(a.id, { kind: "EXAM", itemId: null, examType: "VET", source: "IN_HOUSE", completedDate: "2026-01-01", exam: { create: { overallResult: "NO_CONCERNS", reproductiveStatus: "ALTERED" } } });
  await entry(a.id, { kind: "TEST", itemId: null });
  await entry(a.id, { kind: "TREATMENT", itemId: null });
  assert.deepEqual(await read(a.id), none);
  const surgery = await entry(a.id, { kind: "SURGERY", itemId: null, procedure: "SPAY" });
  assert.deepEqual(await read(a.id), { ...none, isAltered: true });
  await prisma.medicalEntry.update({ where: { id: surgery.id }, data: { voidedAt: new Date() } });
  assert.deepEqual(await read(a.id), none);
});

test("one batched relation selects only distinct qualifying kinds and projects only three booleans", async () => {
  const a = await animal(), b = await animal();
  for (let i = 0; i < 3; i++) await entry(a.id, { vaccine: { create: { durationMonths: 12, veterinarianName: "PRIVATE VET", veterinarianLicenseNumber: "PRIVATE LICENSE" } } });
  await entry(a.id, { kind: "MICROCHIP", itemId: null, chipNumber: `PRIVATE-${randomUUID()}` });
  await entry(a.id, { kind: "SURGERY", itemId: null, procedure: "NEUTER" });
  const rows = await prisma.animal.findMany({ where: { id: { in: [a.id, b.id] } }, select: { id: true, medicalEntries: PUBLIC_MEDICAL_FACTS_SELECT } });
  const facts = rows.map((row) => ({ id: row.id, ...publicMedicalFacts(row.medicalEntries) }));
  const kinds = rows.find((row) => row.id === a.id)!.medicalEntries;
  assert.equal(kinds.length, 3);
  assert.ok(kinds.every((row) => Object.keys(row).join() === "kind"));
  assert.deepEqual(facts.find((row) => row.id === a.id), { id: a.id, isAltered: true, hasMicrochip: true, hasRecordedVaccination: true });
  assert.deepEqual(facts.find((row) => row.id === b.id), { id: b.id, ...none });
  assert.doesNotMatch(JSON.stringify(facts), /PRIVATE|entryId|veterinarian|notes|chipNumber|documents|medicalEntries/);
});
