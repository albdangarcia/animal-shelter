import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { submitVetVisitReport, reviewVetVisitReport, dismissVetVisitReport, type VetVisitReportInput } from "@/app/lib/services/vet-visit-report";
import { recordMedicalEntry, recordScheduledMedicalEntry } from "@/app/lib/services/medical-entry";
import { createMedicalDocument, storeThenRecord } from "@/app/lib/services/medical-document";
import { memoryStore, newDocumentPathname } from "@/app/lib/storage/medical-document-store";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import { findAnimalVetVisitReports, findWaitingVetVisitReports } from "@/app/lib/data/vet-visit-reports";
import { findFosterMedical } from "@/app/lib/data/fosters/foster-medical";
import { findDueMedicalEntries, findLatestRabiesVaccine } from "@/app/lib/data/animals/medical-entry";
import { findAnimalReadiness } from "@/app/lib/data/animals/readiness";
import { calendarDay as day } from "@/app/lib/utils/shelter-day";
import { lockAnimal } from "@/app/lib/data/application-status.data";

const runId = randomUUID();
const today = day("2026-10-16");
let speciesId: string, colorId: string, staffId: string, fosterId: string, strangerId: string, profileId: string, clinicId: string, inactiveId: string, wrongPartnerId: string, vaccineId: string;
const name = (value: string) => `${value} ${runId}`;
before(async () => {
  staffId = (await prisma.person.create({ data: { name: name("Private staff") } })).id;
  fosterId = (await prisma.person.create({ data: { name: name("Foster") } })).id;
  strangerId = (await prisma.person.create({ data: { name: name("Stranger") } })).id;
  profileId = (await prisma.fosterProfile.create({ data: { personId: fosterId, status: "INACTIVE", maxAnimals: 50 } })).id;
  speciesId = (await prisma.species.create({ data: { name: name("Report species") } })).id;
  colorId = (await prisma.color.create({ data: { name: name("Report color") } })).id;
  clinicId = (await prisma.partner.create({ data: { name: name("Clinic"), type: "VET_CLINIC" } })).id;
  inactiveId = (await prisma.partner.create({ data: { name: name("Inactive"), type: "VET_CLINIC", isActive: false } })).id;
  wrongPartnerId = (await prisma.partner.create({ data: { name: name("Rescue"), type: "RESCUE_GROUP" } })).id;
  vaccineId = (await prisma.medicalItem.create({ data: { name: name("Rabies"), kind: "VACCINE", isRabies: true } })).id;
});
after(async () => {
  const where = { animal: { speciesId } };
  await prisma.medicalDocument.deleteMany({ where });
  await prisma.medicalEntry.deleteMany({ where });
  await prisma.vetVisitReport.deleteMany({ where });
  await prisma.intake.deleteMany({ where });
  await prisma.fosterPlacement.deleteMany({ where });
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.fosterProfile.deleteMany({ where: { personId: { in: [fosterId, strangerId] } } });
  await prisma.medicalItem.deleteMany({ where: { id: vaccineId } });
  await prisma.partner.deleteMany({ where: { id: { in: [clinicId, inactiveId, wrongPartnerId] } } });
  await prisma.person.deleteMany({ where: { id: { in: [staffId, fosterId, strangerId] } } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});
async function fixture() {
  const animal = await prisma.animal.create({ data: { name: name("Report animal"), speciesId, primaryColorId: colorId, birthDate: "2024-01-01", sex: "FEMALE", intake: { create: { intakeDate: "2026-09-01", type: "STRAY", staffMemberId: staffId } } } });
  const placement = await prisma.fosterPlacement.create({ data: { animalId: animal.id, fosterProfileId: profileId, placedById: staffId, type: "GENERAL", startDate: "2026-10-11" } });
  return { animalId: animal.id, placementId: placement.id };
}
const input = (animalId: string, extra: Partial<VetVisitReportInput> = {}): VetVisitReportInput => ({ animalId, visitDate: day("2026-10-14"), vetPartnerId: clinicId, summary: "Rabies shot at the clinic.", ...extra });
const submit = (animalId: string, extra: Partial<VetVisitReportInput> = {}, personId = fosterId) => prisma.$transaction((tx) => submitVetVisitReport(tx, input(animalId, extra), personId, today));
const refusal = (field?: string) => (error: unknown) => { assert.ok(error instanceof MedicalEntryRefusal); if (field) assert.equal(error.field, field); return true; };
const vaccine = (animalId: string) => ({ animalId, kind: "VACCINE" as const, itemId: vaccineId, completedDate: day("2026-10-14"), source: "OUTSIDE_VET" as const, vetPartnerId: clinicId, durationMonths: 12 });
const record = (animalId: string, vetReportId: string) => prisma.$transaction((tx) => recordMedicalEntry(tx, vaccine(animalId), staffId, today, { vetReportId }));

test("submission records the placement, foster and activity, even with an inactive profile", async () => {
  const { animalId, placementId } = await fixture();
  const { reportId } = await submit(animalId, { summary: "  Rabies shot at the clinic.  " });
  const report = await prisma.vetVisitReport.findUniqueOrThrow({ where: { id: reportId } });
  assert.equal(report.placementId, placementId); assert.equal(report.reportedById, fosterId); assert.equal(report.reviewedAt, null); assert.equal(report.summary, "Rabies shot at the clinic.");
  const log = await prisma.animalActivityLog.findFirstOrThrow({ where: { animalId, activityType: "VET_VISIT_REPORTED" } });
  assert.equal(log.changedById, fosterId); assert.match(log.changeSummary!, /reported an outside vet visit on Oct 14, 2026 at Clinic/);
});

test("a visit accepts the placement start, today, and a trimmed free-text vet", async () => {
  const { animalId } = await fixture();
  for (const visitDate of [day("2026-10-11"), today]) {
    const { reportId } = await submit(animalId, { visitDate, vetPartnerId: null, vetName: "  Dr. Patel  " });
    assert.equal((await prisma.vetVisitReport.findUniqueOrThrow({ where: { id: reportId } })).vetName, "Dr. Patel");
  }
});
for (const [label, extra, field] of [
  ["before placement", { visitDate: day("2026-10-10") }, "visitDate"],
  ["future", { visitDate: day("2026-10-17") }, "visitDate"],
  ["no clinic or name", { vetPartnerId: null, vetName: "  " }, "vetName"],
  ["both clinic and name", { vetName: "Dr. Patel" }, "vetName"],
  ["long name", { vetPartnerId: null, vetName: "x".repeat(121) }, "vetName"],
  ["empty summary", { summary: "  " }, "summary"],
  ["long summary", { summary: "x".repeat(2001) }, "summary"],
] as const) test(`submission refuses ${label} without writing`, async () => {
  const { animalId } = await fixture();
  await assert.rejects(submit(animalId, extra), refusal(field));
  assert.equal(await prisma.vetVisitReport.count({ where: { animalId } }), 0);
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId } }), 0);
});
for (const type of ["inactive", "non-clinic", "missing"] as const) test(`submission refuses a ${type} partner`, async () => {
  const { animalId } = await fixture();
  await assert.rejects(submit(animalId, { vetPartnerId: type === "inactive" ? inactiveId : type === "non-clinic" ? wrongPartnerId : "cmissingpartner" }), refusal("vetPartnerId"));
});
for (const state of ["wrong person", "ended", "no placement"] as const) test(`submission refuses ${state}`, async () => {
  const { animalId, placementId } = await fixture();
  if (state === "ended") await prisma.fosterPlacement.update({ where: { id: placementId }, data: { endDate: today } });
  if (state === "no placement") await prisma.fosterPlacement.delete({ where: { id: placementId } });
  await assert.rejects(submit(animalId, {}, state === "wrong person" ? strangerId : fosterId), refusal());
});

test("the reporting foster adds paperwork, with private storage and provenance", async () => {
  const { animalId } = await fixture(); const { reportId } = await submit(animalId);
  const store = memoryStore(); const bytes = new TextEncoder().encode("%PDF-1.4\nReport\n");
  const pathname = newDocumentPathname(animalId);
  const { documentId } = await storeThenRecord(store, { pathname, bytes, fresh: true }, (stored) => prisma.$transaction((tx) => createMedicalDocument(tx, { animalId, name: "Vet record", type: "VET_RECORD", vetReportId: reportId, ...stored }, fosterId, today, { foster: { personId: fosterId } })));
  const row = await prisma.medicalDocument.findUniqueOrThrow({ where: { id: documentId } });
  assert.equal(row.vetReportId, reportId); assert.equal(row.uploadedById, fosterId); assert.ok(await store.get(pathname));
  await prisma.$transaction((tx) => reviewVetVisitReport(tx, reportId, staffId));
  const failedPath = newDocumentPathname(animalId);
  await assert.rejects(storeThenRecord(store, { pathname: failedPath, bytes, fresh: true }, (stored) => prisma.$transaction((tx) => createMedicalDocument(tx, { animalId, name: "Too late", type: "VET_RECORD", vetReportId: reportId, ...stored }, fosterId, today, { foster: { personId: fosterId } }))));
  assert.equal(await store.get(failedPath), null);
});

for (const scheduled of [false, true]) test(`${scheduled ? "scheduled" : "ad hoc"} care recorded from a report stores provenance in the row and event`, async () => {
  const { animalId } = await fixture(); const { reportId } = await submit(animalId);
  const written = scheduled ? await prisma.medicalEntry.create({ data: { animalId, kind: "VACCINE", itemId: vaccineId, status: "SCHEDULED", dueDate: today, createdById: staffId } }) : null;
  const result = written ? await prisma.$transaction((tx) => recordScheduledMedicalEntry(tx, written.id, vaccine(animalId), staffId, today, { vetReportId: reportId })) : await record(animalId, reportId);
  const entry = await prisma.medicalEntry.findUniqueOrThrow({ where: { id: result.entryId }, include: { events: true } });
  assert.equal(entry.vetReportId, reportId); assert.equal(entry.reportedByFoster, true); assert.equal(entry.createdById, staffId);
  const event = entry.events.find((event) => event.action === (scheduled ? "COMPLETED" : "CREATED"))!;
  assert.equal((event.after as { vetReportId: string }).vetReportId, reportId); assert.equal((event.after as { reportedByFoster: boolean }).reportedByFoster, true);
  assert.equal((await findAnimalVetVisitReports(prisma, animalId))[0].entries[0].id, entry.id);
});
for (const scheduled of [false, true]) for (const state of ["wrong source", "other animal", "reviewed", "dismissed", "missing"] as const) test(`${scheduled ? "scheduled" : "ad hoc"} report recording refuses ${state}`, async () => {
  const { animalId } = await fixture(); const other = state === "other animal" ? (await fixture()).animalId : animalId;
  let { reportId } = await submit(other);
  if (state === "reviewed") await prisma.$transaction((tx) => reviewVetVisitReport(tx, reportId, staffId));
  if (state === "dismissed") await prisma.$transaction((tx) => dismissVetVisitReport(tx, reportId, "Not medical care", staffId));
  if (state === "missing") reportId = "cmissingreport";
  const values = { ...vaccine(animalId), ...(state === "wrong source" && { source: "IN_HOUSE" as const, vetPartnerId: null }) };
  const entry = scheduled ? await prisma.medicalEntry.create({ data: { animalId, kind: "VACCINE", itemId: vaccineId, status: "SCHEDULED", dueDate: today, createdById: staffId } }) : null;
  await assert.rejects(prisma.$transaction((tx) => entry ? recordScheduledMedicalEntry(tx, entry.id, values, staffId, today, { vetReportId: reportId }) : recordMedicalEntry(tx, values, staffId, today, { vetReportId: reportId })));
  assert.equal(await prisma.medicalEntry.count({ where: { animalId, status: "COMPLETED" } }), 0);
});

for (const mode of ["review", "dismiss"] as const) test(`${mode} is write-once, audits the actor, and leaves reports/documents intact`, async () => {
  const { animalId } = await fixture(); const { reportId } = await submit(animalId);
  if (mode === "review") await record(animalId, reportId);
  await prisma.$transaction((tx) => mode === "review" ? reviewVetVisitReport(tx, reportId, staffId) : dismissVetVisitReport(tx, reportId, "  Duplicate visit  ", staffId));
  const report = await prisma.vetVisitReport.findUniqueOrThrow({ where: { id: reportId } });
  assert.ok(report.reviewedAt); assert.equal(report.reviewedById, staffId); assert.equal(report.dismissReason, mode === "review" ? null : "Duplicate visit");
  await assert.rejects(prisma.$transaction((tx) => reviewVetVisitReport(tx, reportId, staffId)), ConflictError);
  await assert.rejects(prisma.$transaction((tx) => dismissVetVisitReport(tx, reportId, "Again", staffId)), ConflictError);
  const logs = await prisma.animalActivityLog.findMany({ where: { animalId, activityType: mode === "review" ? "VET_VISIT_REPORT_REVIEWED" : "VET_VISIT_REPORT_DISMISSED" } });
  assert.equal(logs.length, 1); assert.equal(logs[0].changedById, staffId); assert.match(logs[0].changeSummary!, mode === "review" ? /1 entry recorded from it/ : /Reason: Duplicate visit/);
});
test("review needs no entry; dismissal needs a bounded reason; missing reports are refused", async () => {
  const { animalId } = await fixture(); const { reportId } = await submit(animalId);
  for (const reason of [" ", "x".repeat(2001)]) await assert.rejects(prisma.$transaction((tx) => dismissVetVisitReport(tx, reportId, reason, staffId)), refusal("reason"));
  await prisma.$transaction((tx) => reviewVetVisitReport(tx, reportId, staffId));
  assert.equal(await prisma.medicalEntry.count({ where: { animalId } }), 0);
  await assert.rejects(prisma.$transaction((tx) => reviewVetVisitReport(tx, "cmissingreport", staffId)), NotFoundError);
});

test("waiting reads group by reporting foster, order oldest first, exclude archived and closed reports, and keep returned animals", async () => {
  const a = await fixture(), b = await fixture(), c = await fixture();
  const oldest = await submit(a.animalId, { visitDate: day("2026-10-11") });
  const newer = await submit(a.animalId, { visitDate: today });
  await submit(b.animalId); await submit(c.animalId);
  await prisma.animal.update({ where: { id: b.animalId }, data: { listingStatus: "ARCHIVED" } });
  const closed = await submit(c.animalId); await prisma.$transaction((tx) => reviewVetVisitReport(tx, closed.reportId, staffId));
  await prisma.fosterPlacement.update({ where: { id: a.placementId }, data: { endDate: today } });
  const groups = await findWaitingVetVisitReports(prisma, [a.animalId, b.animalId, c.animalId]);
  assert.equal(groups.length, 1); assert.equal(groups[0].fosterId, fosterId);
  assert.deepEqual(groups[0].reports.map((report) => report.id), [oldest.reportId, groups[0].reports[1].id, newer.reportId]);
  assert.equal(groups[0].reports.length, 3); assert.equal(groups[0].reports[0].place.type, "NOT_HOUSED");
});

test("the foster reads only their reports and never the reviewer's name", async () => {
  const { animalId } = await fixture(); const { reportId } = await submit(animalId);
  await prisma.$transaction((tx) => dismissVetVisitReport(tx, reportId, "Duplicate paperwork", staffId));
  await prisma.vetVisitReport.create({ data: { ...input(animalId), placementId: (await prisma.fosterPlacement.findFirstOrThrow({ where: { animalId } })).id, reportedById: strangerId } });
  const data = await findFosterMedical(prisma, fosterId, animalId, { day: today, time: "12:00" });
  assert.ok(data); assert.equal(data.reports.length, 1); assert.equal(data.reports[0].dismissReason, "Duplicate paperwork"); assert.equal(data.reports[0].reviewedDate, new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()));
  assert.equal(JSON.stringify(data).includes("Private staff"), false);
});

test("a waiting report about a rabies shot changes no rabies, readiness or due facts", async () => {
  const { animalId } = await fixture();
  await prisma.medicalEntry.create({ data: { animalId, kind: "VACCINE", itemId: vaccineId, status: "SCHEDULED", dueDate: today, createdById: staffId } });
  const facts = async () => ({ rabies: await findLatestRabiesVaccine(prisma, animalId), readiness: await findAnimalReadiness(prisma, animalId, { today, timezone: "America/New_York" }), due: await findDueMedicalEntries(prisma, animalId) });
  const before = await facts(); await submit(animalId); assert.deepEqual(await facts(), before);
});

const pid = async (tx: TransactionClient) => (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
for (const race of ["return", "review"] as const) test(`a report write waiting behind a ${race} rechecks state`, async () => {
  const { animalId, placementId } = await fixture(); const { reportId } = await submit(animalId);
  let release!: () => void, held!: (pid: number) => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const locked = new Promise<number>((resolve) => { held = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    await lockAnimal(tx, animalId);
    if (race === "return") await tx.fosterPlacement.update({ where: { id: placementId }, data: { endDate: today } });
    else await reviewVetVisitReport(tx, reportId, staffId);
    held(await pid(tx)); await gate;
  });
  const holderPid = await locked;
  let started!: (pid: number) => void;
  const starting = new Promise<number>((resolve) => { started = resolve; });
  const writer = prisma.$transaction(async (tx) => { started(await pid(tx)); return race === "return" ? submitVetVisitReport(tx, input(animalId), fosterId, today) : recordMedicalEntry(tx, vaccine(animalId), staffId, today, { vetReportId: reportId }); });
  void writer.catch(() => {});
  try {
    const waiter = await starting; let blocked = false;
    for (let tries = 0; tries < 100; tries++) { blocked = (await prisma.$queryRaw<{ blocked: boolean }[]>`SELECT ${holderPid}::int = ANY(pg_blocking_pids(${waiter}::int)) AS blocked`)[0].blocked; if (blocked) break; await new Promise((resolve) => setTimeout(resolve, 20)); }
    assert.equal(blocked, true);
  } finally { release(); await Promise.allSettled([holder, writer]); }
  await holder; await assert.rejects(writer, race === "return" ? MedicalEntryRefusal : ConflictError);
});

test("waiting visits from two fosters stay in separate groups ordered by their oldest visit", async () => {
  const first = await fixture(), second = await fixture();
  const secondProfile = await prisma.fosterProfile.create({ data: { personId: strangerId, maxAnimals: 2 } });
  await prisma.fosterPlacement.update({ where: { id: second.placementId }, data: { fosterProfileId: secondProfile.id } });
  const oldest = await submit(first.animalId, { visitDate: day("2026-10-11") });
  const latest = await submit(first.animalId, { visitDate: today });
  const middle = await submit(second.animalId, { visitDate: day("2026-10-12") }, strangerId);
  const groups = await findWaitingVetVisitReports(prisma, [first.animalId, second.animalId]);
  assert.deepEqual(groups.map((group) => ({ fosterId: group.fosterId, reports: group.reports.map((report) => report.id) })), [
    { fosterId, reports: [oldest.reportId, latest.reportId] },
    { fosterId: strangerId, reports: [middle.reportId] },
  ]);
});
