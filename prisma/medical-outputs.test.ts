import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { findMedicalHistoryOutput, findRabiesCertificateOutput } from "@/app/lib/data/animals/medical-output";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import { editMedicalEntry, voidMedicalEntry } from "@/app/lib/services/medical-entry";

const run = randomUUID();
const clock = { today: calendarDay("2026-10-17"), now: new Date("2026-10-17T16:00:00Z") };
let speciesId: string, colorId: string, actorId: string, itemId: string;
before(async () => {
  speciesId = (await prisma.species.create({ data: { name: `Output species ${run}` } })).id;
  colorId = (await prisma.color.create({ data: { name: `Output color ${run}` } })).id;
  actorId = (await prisma.person.create({ data: { name: `PRIVATE ACTOR ${run}` } })).id;
  itemId = (await prisma.medicalItem.create({ data: { kind: "VACCINE", name: `Recorded product ${run}`, isRabies: true } })).id;
});
after(async () => {
  const animals = await prisma.animal.findMany({ where: { speciesId }, select: { id: true } });
  const animalId = { in: animals.map((a) => a.id) };
  await prisma.medicalDocument.deleteMany({ where: { animalId } });
  await prisma.medicalCondition.deleteMany({ where: { animalId } });
  await prisma.medicalEntry.deleteMany({ where: { animalId } });
  await prisma.vetVisitReport.deleteMany({ where: { animalId } });
  await prisma.fosterPlacement.deleteMany({ where: { animalId } });
  await prisma.fosterProfile.deleteMany({ where: { personId: actorId } });
  await prisma.outcome.deleteMany({ where: { animalId } });
  await prisma.intake.deleteMany({ where: { animalId } });
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.medicalItem.deleteMany({ where: { name: { contains: run } } });
  await prisma.person.delete({ where: { id: actorId } });
  await prisma.species.delete({ where: { id: speciesId } });
  await prisma.color.delete({ where: { id: colorId } });
  await prisma.$disconnect();
});
const animal = () => prisma.animal.create({ data: { name: `Output animal ${run}`, birthDate: "2020-01-01", sex: "UNKNOWN", speciesId, primaryColorId: colorId } });
const entry = (animalId: string, data: Partial<Prisma.MedicalEntryUncheckedCreateInput> = {}) => prisma.medicalEntry.create({ data: {
  animalId, kind: "VACCINE", status: "COMPLETED", source: "BEFORE_INTAKE", completedDate: "2026-01-01", itemId,
  notes: "PRIVATE ENTRY NOTES", vetName: "PRIVATE VET IDENTITY", createdById: actorId,
  ...data,
} });
const read = (id: string) => findMedicalHistoryOutput(prisma, id, clock);

test("empty and missing histories do not invent clinical facts or legacy clinical details", async () => {
  assert.equal(await read("missing"), null);
  const a = await animal();
  await prisma.outcome.create({ data: { animalId: a.id, outcomeDate: "2026-10-10", type: "DECEASED", staffMemberId: actorId, previousListingStatus: "DRAFT" } });
  const output = (await read(a.id))!;
  assert.deepEqual(output.summary, { altered: { status: "UNKNOWN", lapsedOn: null }, chips: [], rabies: { status: "NONE" } });
  for (const key of ["completedCare", "conditions", "careEpisodes", "medications", "plannedCare", "documents"] as const) assert.deepEqual(output[key], []);
  assert.equal(output.animal.birthDate, "2020-01-01");
  assert.equal(output.generatedAt.toISOString(), clock.now.toISOString());
});

test("history is unpaginated across stays, deterministic with unknown days last, and read-only", async () => {
  const a = await animal();
  await prisma.intake.createMany({ data: ["2024-01-01", "2026-01-01"].map((intakeDate) => ({ animalId: a.id, intakeDate, type: "STRAY", staffMemberId: actorId })) });
  for (let i = 0; i < 15; i++) await entry(a.id, { completedDate: i === 0 ? null : i < 4 ? "2024-01-02" : `2026-01-${String(i).padStart(2, "0")}` });
  const before = await prisma.medicalEntry.count({ where: { animalId: a.id } });
  const output = (await read(a.id))!;
  assert.equal(output.completedCare.length, 15);
  assert.equal(output.completedCare[0].completedDate, "2026-01-14");
  assert.equal(output.completedCare.at(-1)!.completedDate, null);
  assert.deepEqual(output, await read(a.id));
  assert.equal(await prisma.medicalEntry.count({ where: { animalId: a.id } }), before);
  assert.equal(await prisma.medicalDocument.count({ where: { animalId: a.id } }), 0);
  assert.equal(await prisma.medicalEntryEvent.count({ where: { entry: { animalId: a.id } } }), 0);
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId: a.id } }), 0);
});

test("completed, planned and exempt care remain distinct; clinical and any outcome-linked rows never count", async () => {
  const a = await animal();
  await entry(a.id);
  await entry(a.id, { status: "SCHEDULED", source: null, completedDate: null, dueDate: "2026-10-01" });
  await entry(a.id, { status: "DECLINED", source: null, completedDate: null, declineReason: "PRIVATE DECLINE" });
  await entry(a.id, { voidedAt: clock.now, voidReason: "PRIVATE VOID" });
  await entry(a.id, { kind: "SURGERY", itemId: null, procedure: "SPAY", status: "DECLINED", source: null, completedDate: null, exemptionReason: "MEDICAL_RISK", reviewDate: "2026-10-17" });
  for (const kind of ["EUTHANASIA", "DEATH", "VACCINE"] as const) {
    const outcome = await prisma.outcome.create({ data: { animalId: a.id, outcomeDate: "2026-10-10", type: "DECEASED", staffMemberId: actorId, previousListingStatus: "DRAFT" } });
    await entry(a.id, { kind, outcomeId: outcome.id });
  }
  const output = (await read(a.id))!;
  assert.equal(output.completedCare.length, 1);
  assert.equal(output.plannedCare.length, 2);
  assert.equal(output.plannedCare[0].overdue, true);
  assert.deepEqual(output.summary.altered, { status: "EXEMPT", reason: "MEDICAL_RISK", reviewDate: "2026-10-17" });
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|outcomeId|entryId|declineReason|voidReason/);
});

test("retired and renamed catalogs do not recalculate stored rabies or analyte facts", async () => {
  const a = await animal();
  const e = await entry(a.id);
  await prisma.vaccineDetails.create({ data: { entryId: e.id, durationMonths: 12, validUntilDate: "2026-10-17", manufacturer: "Recorded manufacturer", veterinarianName: "PRIVATE CREDENTIAL", veterinarianLicenseNumber: "PRIVATE LICENSE" } });
  await prisma.medicalItem.update({ where: { id: itemId }, data: { isRabies: false, retiredAt: clock.now, name: `Renamed product ${run}` } });
  const item = await prisma.medicalItem.create({ data: { kind: "TEST", name: `Test ${run}`, analytes: { create: { name: "Renamed analyte", sortOrder: 0 } } }, include: { analytes: true } });
  await entry(a.id, { kind: "TEST", itemId: item.id, test: { create: { results: { create: { analyteId: item.analytes[0].id, analyteName: "Recorded analyte", result: "POSITIVE" } } } } });
  const output = (await read(a.id))!;
  assert.deepEqual(output.summary.rabies, { status: "VALID", validUntilDate: "2026-10-17" });
  assert.ok(output.completedCare.some((c) => c.kind === "TEST" && c.results[0].analyteName === "Recorded analyte"));
  assert.ok(output.completedCare.some((c) => c.kind === "VACCINE" && c.product === `Renamed product ${run}` && c.manufacturer === "Recorded manufacturer"));
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|Renamed analyte|veterinarian/);
});

test("all structured completed kinds print; chips have independent registration without notes", async () => {
  const a = await animal();
  const treatment = await prisma.medicalItem.create({ data: { kind: "TREATMENT", name: `Structured treatment ${run}` } });
  await entry(a.id, { kind: "TREATMENT", itemId: treatment.id, source: "IN_HOUSE", treatment: { create: { doseAmount: 2, doseUnit: "ML", route: "ORAL" } }, reportedByFoster: true });
  await entry(a.id, { kind: "SURGERY", itemId: null, procedure: "SPAY", completedDate: null, surgery: { create: { evidence: "VET_RECORDS", findings: "PRIVATE FINDINGS", anesthesiaNotes: "PRIVATE ANESTHESIA", surgeon: "PRIVATE SURGEON" } } });
  await entry(a.id, { kind: "EXAM", itemId: null, source: "IN_HOUSE", examType: "VET", exam: { create: { overallResult: "NEEDS_VET_REVIEW", reproductiveStatus: "INTACT", findings: { create: { bodySystem: "EYES", status: "ABNORMAL", notes: "PRIVATE FINDING" } } } } });
  for (const [i, registrationStatus] of (["UNKNOWN", "NOT_REGISTERED", "PENDING", "REGISTERED"] as const).entries()) {
    await entry(a.id, { kind: "MICROCHIP", itemId: null, chipNumber: `${run.replaceAll("-", "")}${i}`, microchip: { create: { brand: "Recorded brand", registrationStatus, registryName: i > 1 ? "Registry" : null, registrationDate: i === 3 ? "2026-01-02" : null, registrationNotes: "PRIVATE REGISTRATION" } } });
  }
  const output = (await read(a.id))!;
  assert.equal(output.completedCare.length, 7);
  assert.equal(output.summary.chips.length, 4);
  assert.equal(output.summary.chips.find((c) => c.registrationStatus === "REGISTERED")!.registrationDate, "2026-01-02");
  assert.deepEqual(output.summary.altered, { status: "ALTERED", procedure: "SPAY", completedDate: null });
  assert.ok(output.completedCare.some((c) => c.provenance === "Given in foster"));
  assert.ok(output.completedCare.some((c) => c.kind === "EXAM" && c.findings[0].status === "ABNORMAL"));
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|notes|actor|events|createdBy|surgeon|entryId|reproductiveStatus/);
});

test("conditions survive voided sources; archived open care and all live order states stay truthful", async () => {
  const a = await animal();
  const source = await entry(a.id, { voidedAt: clock.now });
  for (const status of ["ACTIVE", "CHRONIC", "RESOLVED"] as const) await prisma.medicalCondition.create({ data: {
    animalId: a.id, name: `Condition ${status}`, type: status === "CHRONIC" ? "ALLERGY" : "CONDITION", status,
    onsetDate: "2026-01-01", resolvedDate: status === "RESOLVED" ? "2026-01-05" : null,
    notes: "PRIVATE CONDITION", diagnosedBy: "PRIVATE DIAGNOSER", sourceEntryId: source.id, createdById: actorId,
  } });
  await prisma.medicalCondition.create({ data: { animalId: a.id, name: "PRIVATE VOIDED CONDITION", type: "CONDITION", status: "ACTIVE", voidedAt: clock.now, createdById: actorId } });
  await prisma.careEpisode.create({ data: { animalId: a.id, type: "UNDER_VET_CARE", startDate: "2026-01-01", reason: "PRIVATE REASON", notes: "PRIVATE EPISODE", openedById: actorId } });
  await prisma.careEpisode.create({ data: { animalId: a.id, type: "HOSPITALISED_IN_HOUSE", startDate: "2025-01-01", endDate: "2025-01-02", reason: "PRIVATE REASON", openedById: actorId } });
  await prisma.careEpisode.create({ data: { animalId: a.id, type: "UNDER_VET_CARE", startDate: "2025-01-01", voidedAt: clock.now, reason: "PRIVATE VOIDED EPISODE", openedById: actorId } });
  const medication = await prisma.medicalItem.create({ data: { kind: "MEDICATION", name: `Medication ${run}` } });
  for (const state of ["ACTIVE", "UPCOMING", "ENDED", "DISCONTINUED", "VOIDED"]) await prisma.medicationOrder.create({ data: {
    animalId: a.id, itemId: medication.id, doseAmount: 1, doseUnit: "TABLET", route: "ORAL", frequency: "SID", firstSlot: "AM",
    startDate: state === "UPCOMING" ? "2026-10-18" : "2026-01-01", endDate: state === "ENDED" ? "2026-10-16" : null,
    discontinuedDate: state === "DISCONTINUED" ? "2026-01-03" : null, voidedAt: state === "VOIDED" ? clock.now : null,
    instructions: "Give with food", prescribedBy: "PRIVATE PRESCRIBER", discontinueReason: "PRIVATE REASON", createdById: actorId,
  } });
  await prisma.animal.update({ where: { id: a.id }, data: { listingStatus: "ARCHIVED", archiveReason: "ADOPTION" } });
  const output = (await read(a.id))!;
  assert.equal(output.conditions.length, 3);
  assert.equal(output.careEpisodes.length, 2);
  assert.equal(output.careEpisodes[0].endDate, null);
  assert.deepEqual(output.medications.map((o) => o.state).sort(), ["ACTIVE", "UPCOMING", "ENDED", "DISCONTINUED"].sort());
  assert.ok(output.medications.every((o) => o.instructions === "Give with food"));
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|sourceEntry|prescribedBy|reason|doses|missed|adherence/i);
});

test("document metadata requires a relevant live held file and eligible completed entry", async () => {
  const a = await animal();
  const completed = await entry(a.id);
  const scheduled = await entry(a.id, { status: "SCHEDULED", source: null, completedDate: null, dueDate: "2026-10-17" });
  const voided = await entry(a.id, { voidedAt: clock.now });
  const death = await entry(a.id, { kind: "DEATH" });
  for (const [label, entryId, type, voidedAt, fileRemovedAt] of [
    ["Animal paper", null, "VET_RECORD", null, null], ["Lab paper", completed.id, "LAB_RESULT", null, null],
    ["Imaging", completed.id, "IMAGING", null, null], ["Prescription", null, "PRESCRIPTION", null, null],
    ["PRIVATE SCHEDULE", scheduled.id, "VET_RECORD", null, null], ["PRIVATE VOIDED ENTRY", voided.id, "VET_RECORD", null, null],
    ["PRIVATE CLINICAL", death.id, "VET_RECORD", null, null], ["PRIVATE CONSENT", null, "CONSENT_FORM", null, null],
    ["PRIVATE VOIDED PAPER", completed.id, "VET_RECORD", clock.now, null], ["PRIVATE REMOVED", null, "VET_RECORD", clock.now, clock.now],
  ] as const) await prisma.medicalDocument.create({ data: { animalId: a.id, entryId, name: label, type, voidedAt, fileRemovedAt,
    documentDate: "2026-01-02", notes: "PRIVATE DOCUMENT", pathname: `PRIVATE-PATH/${randomUUID()}`, contentType: "application/pdf", sizeBytes: 100, uploadedById: actorId,
  } });
  const output = (await read(a.id))!;
  assert.equal(output.documents.length, 4);
  assert.ok(output.documents.every((d) => Object.keys(d).sort().join() === "documentDate,name,type"));
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|pathname|contentType|uploadedBy|documentId/);
});

test("fresh reads use corrected values and exclude subsequent voids without writing an issuance record", async () => {
  const a = await animal();
  const treatment = await prisma.medicalItem.create({ data: { kind: "TREATMENT", name: `Correction treatment ${run}` } });
  const e = await entry(a.id, { kind: "TREATMENT", itemId: treatment.id, treatment: { create: { doseAmount: 1, doseUnit: "ML", route: "ORAL" } } });
  await prisma.$transaction((tx) => editMedicalEntry(tx, e.id, { kind: "TREATMENT", itemId: treatment.id, completedDate: calendarDay("2026-01-02"), source: "BEFORE_INTAKE", doseAmount: 3 }, actorId, clock.today));
  const corrected = (await read(a.id))!.completedCare[0];
  assert.equal(corrected.completedDate, "2026-01-02");
  assert.equal(corrected.kind === "TREATMENT" && corrected.doseAmount, 3);
  await prisma.$transaction((tx) => voidMedicalEntry(tx, e.id, "PRIVATE VOID", actorId));
  assert.deepEqual((await read(a.id))!.completedCare, []);
});

test("concurrent void and detail correction cannot mix different snapshots in one output", async () => {
  const a = await animal();
  const e = await entry(a.id);
  await prisma.vaccineDetails.create({ data: { entryId: e.id, lotNumber: "Original lot", durationMonths: 12, validUntilDate: "2026-10-17" } });
  let changed = false;
  const observed = prisma.$extends({ query: { medicalEntry: { async findMany({ args, query }) {
    const rows = await query(args);
    if (!changed) {
      changed = true;
      await prisma.$transaction(async (tx) => {
        await tx.vaccineDetails.update({ where: { entryId: e.id }, data: { lotNumber: "Corrected lot", validUntilDate: "2027-01-01" } });
        await tx.medicalEntry.update({ where: { id: e.id }, data: { voidedAt: clock.now } });
      });
    }
    return rows;
  } } } });
  const snapshot = (await findMedicalHistoryOutput(observed as typeof prisma, a.id, clock))!;
  assert.equal(changed, true);
  assert.equal(snapshot.completedCare.length, 1);
  assert.equal(snapshot.completedCare[0].kind === "VACCINE" && snapshot.completedCare[0].lotNumber, "Original lot");
  assert.deepEqual(snapshot.summary.rabies, { status: "VALID", validUntilDate: "2026-10-17" });
  assert.deepEqual((await read(a.id))!.completedCare, []);
});


test("report provenance survives source correction; raw reports and report-only papers are excluded", async () => {
  const a = await animal();
  const profile = await prisma.fosterProfile.create({ data: { personId: actorId } });
  const placement = await prisma.fosterPlacement.create({ data: { animalId: a.id, fosterProfileId: profile.id, type: "GENERAL", startDate: "2026-01-01", placedById: actorId } });
  const report = await prisma.vetVisitReport.create({ data: { animalId: a.id, placementId: placement.id, reportedById: actorId, visitDate: "2026-01-02", summary: "PRIVATE RAW REPORT", vetName: "PRIVATE CLINIC" } });
  assert.deepEqual((await read(a.id))!.completedCare, []);
  const e = await entry(a.id, { source: "IN_HOUSE", vetReportId: report.id, reportedByFoster: false });
  for (const entryId of [null, e.id]) await prisma.medicalDocument.create({ data: {
    animalId: a.id, entryId, vetReportId: report.id, name: entryId ? "Included recorded-care paper" : "PRIVATE REPORT PAPER", type: "VET_RECORD",
    pathname: `PRIVATE-PATH/${randomUUID()}`, contentType: "application/pdf", sizeBytes: 100, uploadedById: actorId,
  } });
  const output = (await read(a.id))!;
  assert.equal(output.completedCare[0].provenance, "Recorded from a foster's report");
  assert.equal(output.documents.length, 1);
  assert.equal(output.documents[0].name, "Included recorded-care paper");
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|vetReportId|reportedBy|placementId/);
});

test("intact, unknown and lapsed exemptions reuse the existing derivation without claiming altered", async () => {
  const a = await animal();
  const exam = await entry(a.id, { kind: "EXAM", itemId: null, source: "IN_HOUSE", examType: "VET", exam: { create: { overallResult: "NO_CONCERNS", reproductiveStatus: "INTACT" } } });
  await entry(a.id, { kind: "SURGERY", itemId: null, procedure: "SPAY", status: "DECLINED", source: null, completedDate: null, exemptionReason: "MEDICAL_RISK", reviewDate: "2026-10-16" });
  assert.deepEqual((await read(a.id))!.summary.altered, { status: "INTACT", examDate: "2026-01-01", lapsedOn: "2026-10-16" });
  await prisma.examDetails.update({ where: { entryId: exam.id }, data: { reproductiveStatus: "UNDETERMINED" } });
  assert.deepEqual((await read(a.id))!.summary.altered, { status: "UNKNOWN", lapsedOn: "2026-10-16" });
});

const certificateRead = (animalId: string, entryId: string, today = clock.today) =>
  findRabiesCertificateOutput(prisma, animalId, entryId, { ...clock, today });
const certificateVaccine = { durationMonths: 12, validUntilDate: "2026-10-17",
  veterinarianName: "Dr Recorded", veterinarianLicenseNumber: "LICENSE-RECORDED" };

test("certificate refuses missing, mismatched, non-rabies, non-completed, voided and outcome-linked selections", async () => {
  const a = await animal(), other = await animal();
  assert.equal((await certificateRead(a.id, "missing")).available, false);
  for (const data of [
    { kind: "TEST" }, { status: "SCHEDULED" }, { status: "DECLINED" }, { voidedAt: clock.now },
  ] as Partial<Prisma.MedicalEntryUncheckedCreateInput>[]) {
    const e = await entry(a.id, { ...data, vaccine: { create: certificateVaccine } });
    assert.deepEqual(await certificateRead(a.id, e.id), { available: false, reason: "NOT_COMPLETED_RABIES", message: "A certificate requires a completed, non-voided rabies vaccination record." });
  }
  const ordinary = await entry(a.id, { vaccine: { create: { ...certificateVaccine, durationMonths: null } } });
  assert.equal((await certificateRead(a.id, ordinary.id)).available, false);
  const missingDetails = await entry(a.id);
  assert.equal((await certificateRead(a.id, missingDetails.id)).available, false);
  const outcome = await prisma.outcome.create({ data: { animalId: a.id, outcomeDate: "2026-01-01", type: "DECEASED", staffMemberId: actorId, previousListingStatus: "DRAFT" } });
  const linked = await entry(a.id, { outcomeId: outcome.id, vaccine: { create: certificateVaccine } });
  assert.equal((await certificateRead(a.id, linked.id)).available, false);
  const result = await certificateRead(other.id, ordinary.id);
  assert.ok(!result.available);
  assert.equal(result.reason, "NOT_FOUND");
  assert.doesNotMatch(JSON.stringify(result), /Dr Recorded|LICENSE|animalId|veterinarian/);
});

test("incomplete certificate facts remain in history without borrowing actor or clinic credentials", async () => {
  const a = await animal();
  for (const [completedDate, validUntilDate, veterinarianName, veterinarianLicenseNumber, reason] of [
    [null, null, "Dr Recorded", "LICENSE", "DAY_UNKNOWN"],
    ["2026-01-01", null, "Dr Recorded", "LICENSE", "VALIDITY_UNKNOWN"],
    ["2026-01-01", "2027-01-01", null, "LICENSE", "CREDENTIALS_MISSING"],
    ["2026-01-01", "2027-01-01", "Dr Recorded", null, "CREDENTIALS_MISSING"],
  ] as const) {
    const e = await entry(a.id, { completedDate, vaccine: { create: { durationMonths: 12, validUntilDate, veterinarianName, veterinarianLicenseNumber } } });
    const result = await certificateRead(a.id, e.id);
    assert.ok(!result.available);
    assert.equal(result.reason, reason);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|LICENSE|Dr Recorded/);
  }
  assert.equal((await read(a.id))!.completedCare.length, 4);
});

test("certificate prints the selected historical record and stored facts regardless of catalog changes", async () => {
  const a = await animal();
  const e = await entry(a.id, { completedDate: "2025-10-17", vaccine: { create: {
    ...certificateVaccine, manufacturer: "Recorded manufacturer", lotNumber: "Selected lot", lotExpiryDate: "2025-12-01",
    route: "SUBCUTANEOUS", site: "Right shoulder", rabiesTagNumber: "TAG-SELECTED",
  } } });
  await entry(a.id, { completedDate: "2026-10-16", vaccine: { create: { ...certificateVaccine, validUntilDate: "2029-10-16", lotNumber: "Newer lot" } } });
  await prisma.medicalItem.update({ where: { id: itemId }, data: { isRabies: false, retiredAt: clock.now } });
  await prisma.animal.update({ where: { id: a.id }, data: { listingStatus: "ARCHIVED", archiveReason: "ADOPTION" } });
  const result = await certificateRead(a.id, e.id);
  assert.ok(result.available);
  assert.equal(result.output.vaccination.lotNumber, "Selected lot");
  assert.equal(result.output.vaccination.durationMonths, 12);
  assert.equal(result.output.certificate.completedDate, "2025-10-17");
  assert.equal(result.output.certificate.validUntilDate, "2026-10-17");
  assert.equal(result.output.certificate.expired, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|Newer lot|createdBy|notes|events|entryId|pathname/);
  const expired = await certificateRead(a.id, e.id, calendarDay("2026-10-18"));
  assert.ok(expired.available);
  assert.equal(expired.output.certificate.expired, true);
  assert.equal(await prisma.medicalEntryEvent.count({ where: { entryId: e.id } }), 0);
  assert.equal(await prisma.medicalDocument.count({ where: { animalId: a.id } }), 0);
  assert.equal(await prisma.animalActivityLog.count({ where: { animalId: a.id } }), 0);
});

test("fresh certificate reflects audited day, duration and veterinarian corrections and refuses a subsequent void", async () => {
  const a = await animal();
  const e = await entry(a.id, { vaccine: { create: certificateVaccine } });
  await prisma.$transaction((tx) => editMedicalEntry(tx, e.id, {
    kind: "VACCINE", itemId, source: "BEFORE_INTAKE", completedDate: calendarDay("2026-02-28"),
    durationMonths: 36, veterinarianName: "Dr Corrected", veterinarianLicenseNumber: "LICENSE-CORRECTED",
  }, actorId, clock.today));
  const result = await certificateRead(a.id, e.id);
  assert.ok(result.available);
  assert.equal(result.output.certificate.completedDate, "2026-02-28");
  assert.equal(result.output.certificate.validUntilDate, "2029-02-28");
  assert.equal(result.output.certificate.veterinarianName, "Dr Corrected");
  assert.equal(result.output.certificate.veterinarianLicenseNumber, "LICENSE-CORRECTED");
  assert.equal(result.output.vaccination.durationMonths, 36);
  await prisma.$transaction((tx) => voidMedicalEntry(tx, e.id, "Wrong animal", actorId));
  assert.equal((await certificateRead(a.id, e.id)).available, false);
});

test("certificate identity and details share the eligibility snapshot across a concurrent void and correction", async () => {
  const a = await animal();
  const e = await entry(a.id, { vaccine: { create: certificateVaccine } });
  let changed = false;
  const observed = prisma.$extends({ query: { medicalEntry: { async findFirst({ args, query }) {
    const row = await query(args);
    if (!changed) {
      changed = true;
      await prisma.$transaction(async (tx) => {
        await tx.vaccineDetails.update({ where: { entryId: e.id }, data: { veterinarianName: "Dr Concurrent", validUntilDate: "2029-01-01" } });
        await tx.medicalEntry.update({ where: { id: e.id }, data: { voidedAt: clock.now } });
        await tx.animal.update({ where: { id: a.id }, data: { name: "Concurrent identity" } });
      });
    }
    return row;
  } } } });
  const result = await findRabiesCertificateOutput(observed as typeof prisma, a.id, e.id, clock);
  assert.equal(changed, true);
  assert.ok(result.available);
  assert.equal(result.output.certificate.veterinarianName, "Dr Recorded");
  assert.equal(result.output.certificate.validUntilDate, "2026-10-17");
  assert.equal(result.output.animal.name, a.name);
  assert.equal((await certificateRead(a.id, e.id)).available, false);
});
