import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { recordOutcomeMedical, correctOutcomeMedical, voidOutcomeMedical } from "@/app/lib/services/outcome-medical";
import {
  recordMedicalEntry, scheduleMedicalEntry, recordScheduledMedicalEntry,
  editMedicalEntry, voidMedicalEntry, rescheduleMedicalEntry, declineMedicalEntry,
  type RecordMedicalEntryInput, type ScheduleMedicalEntryInput,
} from "@/app/lib/services/medical-entry";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import { OutcomeType } from "@/prisma/generated/enums";
import type { OutcomeMedicalDetailsInput } from "@/app/lib/zod-schemas/outcome-medical.schemas";

const runId = randomUUID().slice(0, 8);
const missingId = "cmvc07m5h0094dtulmaxfa9gc";
let speciesId: string;
let colorId: string;
let recorderId: string;
let editorId: string;
let authorizerId: string;
let performerId: string;
let clinicId: string;
let closedClinicId: string;
let rescueId: string;

before(async () => {
  speciesId = (await prisma.species.create({ data: { name: `Linked medical ${runId}` } })).id;
  colorId = (await prisma.color.create({ data: { name: `Linked medical ${runId}` } })).id;
  const person = async (name: string) => (await prisma.person.create({ data: { name: `${name} ${runId}` } })).id;
  recorderId = await person("Recorder");
  editorId = await person("Editor");
  authorizerId = await person("Authorizer without account");
  performerId = await person("Performer without account");
  clinicId = (await prisma.partner.create({ data: { name: `Clinic ${runId}`, type: "VET_CLINIC" } })).id;
  closedClinicId = (await prisma.partner.create({ data: { name: `Closed clinic ${runId}`, type: "VET_CLINIC", isActive: false } })).id;
  rescueId = (await prisma.partner.create({ data: { name: `Rescue ${runId}`, type: "RESCUE_GROUP" } })).id;
});

after(async () => {
  const scope = { animal: { speciesId } };
  await prisma.medicalDocument.deleteMany({ where: scope });
  await prisma.medicalEntry.deleteMany({ where: scope });
  await prisma.outcome.deleteMany({ where: scope });
  await prisma.intake.deleteMany({ where: scope });
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.partner.deleteMany({ where: { id: { in: [clinicId, closedClinicId, rescueId] } } });
  await prisma.person.deleteMany({ where: { id: { in: [recorderId, editorId, authorizerId, performerId] } } });
  await prisma.color.delete({ where: { id: colorId } });
  await prisma.species.delete({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const euthanasia = () => ({
  kind: "EUTHANASIA", source: "IN_HOUSE", reasonCategory: "MEDICAL",
  authorizedById: authorizerId, performedById: performerId,
  drug: "Recorded agent", dose: "Recorded amount mL", route: "Recorded route",
  reasonNotes: "Clinical reason", witness: "Recorded witness", bodyDisposition: "Pending",
} as const);
const death = () => ({
  kind: "DEATH", circumstances: "FOUND_DEAD", causeKnowledge: "UNKNOWN", necropsyRequested: null,
} as const);

async function fixture(type: OutcomeType = "EUTHANIZED") {
  const animal = await prisma.animal.create({ data: {
    name: `Linked medical ${runId}`, speciesId, primaryColorId: colorId,
    birthDate: "2020-01-01", sex: "UNKNOWN", listingStatus: "ARCHIVED", archiveReason: type,
  } });
  const outcome = await prisma.outcome.create({ data: {
    animalId: animal.id, type, outcomeDate: "2026-01-03", staffMemberId: recorderId,
    createdAt: new Date("2026-01-04T12:00:00Z"), notes: "Outcome note stays separate",
  } });
  return { animalId: animal.id, outcomeId: outcome.id };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const locked = <T>(f: Fixture, run: (tx: TransactionClient) => Promise<T>) => prisma.$transaction(async (tx) => {
  await lockAnimal(tx, f.animalId);
  return run(tx);
});
const create = (f: Fixture, medical: OutcomeMedicalDetailsInput = euthanasia(), actorId = recorderId) =>
  locked(f, (tx) => recordOutcomeMedical(tx, f.outcomeId, f.animalId, medical, actorId));
const correct = (f: Fixture, medical?: OutcomeMedicalDetailsInput) =>
  locked(f, (tx) => correctOutcomeMedical(tx, f.outcomeId, f.animalId, medical, editorId));

async function state(f: Fixture) {
  const entries = await prisma.medicalEntry.findMany({ where: { animalId: f.animalId }, orderBy: { id: "asc" } });
  const entryIds = entries.map((entry) => entry.id);
  return {
    outcome: await prisma.outcome.findUnique({ where: { id: f.outcomeId } }),
    animal: await prisma.animal.findUnique({ where: { id: f.animalId } }), entries,
    euthanasia: await prisma.euthanasiaDetails.findMany({ where: { entryId: { in: entryIds } } }),
    death: await prisma.deathDetails.findMany({ where: { entryId: { in: entryIds } } }),
    events: await prisma.medicalEntryEvent.findMany({ where: { entryId: { in: entryIds } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    activities: await prisma.animalActivityLog.findMany({ where: { animalId: f.animalId }, orderBy: [{ changedAt: "asc" }, { id: "asc" }] }),
  };
}

async function refusedUnchanged(f: Fixture, run: () => Promise<unknown>, check: (error: unknown) => boolean) {
  const before = await state(f);
  await assert.rejects(run, check);
  assert.deepEqual(await state(f), before);
}
const fieldRefusal = (field: string) => (error: unknown) => error instanceof MedicalEntryRefusal && error.field === field;
const conflict = (error: unknown) => error instanceof ConflictError;

for (const [type, payload] of [["EUTHANIZED", euthanasia], ["DECEASED", death]] as const) {
  test(`${type} creates a completed same-day immutable link with truthful facts and one complete audit`, async () => {
    const f = await fixture(type);
    const original = await state(f);
    const start = Date.now();
    const result = await create(f, payload());
    const saved = await state(f);
    assert.equal(result.status, "created");
    assert.deepEqual(saved.outcome, original.outcome);
    assert.deepEqual(saved.animal, original.animal);
    assert.equal(saved.entries.length, 1);
    const entry = saved.entries[0];
    assert.equal(entry.outcomeId, f.outcomeId);
    assert.equal(entry.kind, payload().kind);
    assert.equal(entry.completedDate, "2026-01-03");
    assert.equal(entry.status, "COMPLETED");
    assert.equal(entry.createdById, recorderId);
    assert.ok(entry.createdAt.getTime() >= start);
    for (const field of ["itemId", "dueDate", "protocolStepId", "batchId", "vetReportId", "notes", "administeredById"] as const) assert.equal(entry[field], null, field);
    assert.equal(entry.reportedByFoster, false);
    assert.equal(entry.source, type === "DECEASED" ? null : "IN_HOUSE");
    assert.equal(saved.events.length, 1);
    assert.equal(saved.events[0].action, "CREATED");
    assert.equal(saved.events[0].actorId, recorderId);
    assert.equal(saved.events[0].before, null);
    const common = { outcomeId: f.outcomeId, kind: entry.kind, status: "COMPLETED", completedDate: "2026-01-03", source: entry.source, vetName: null, vetPartnerId: null, administeredById: null };
    assert.deepEqual(saved.events[0].after, type === "DECEASED"
      ? { ...common, circumstances: "FOUND_DEAD", circumstanceNotes: null, cause: null, necropsyRequested: null, bodyDisposition: null }
      : { ...common, reasonCategory: "MEDICAL", reasonNotes: "Clinical reason", authorizedById: authorizerId, performedById: performerId, performedByName: null, drug: "Recorded agent", dose: "Recorded amount mL", route: "Recorded route", witness: "Recorded witness", bodyDisposition: "Pending" });
    assert.equal(saved.activities.length, 1);
    assert.equal(saved.activities[0].activityType, "MEDICAL_ENTRY_RECORDED");
    assert.equal(saved.activities[0].changedById, recorderId);
    assert.doesNotMatch(saved.activities[0].changeSummary!, /Clinical reason|Recorded agent|Outcome note/);
    assert.equal(saved.euthanasia.length, type === "EUTHANIZED" ? 1 : 0);
    assert.equal(saved.death.length, type === "DECEASED" ? 1 : 0);
    await refusedUnchanged(f, () => create(f, payload()), conflict);
  });

  test(`${type} supports explicit late attachment, omission, no-op, and date-only synchronization`, async () => {
    const f = await fixture(type);
    const before = await state(f);
    assert.equal((await correct(f)).status, "unchanged");
    assert.deepEqual(await state(f), before);
    assert.equal((await correct(f, payload())).status, "created");
    const attached = await state(f);
    assert.deepEqual(attached.outcome, before.outcome);
    assert.equal(attached.entries[0].createdById, editorId);
    assert.ok(attached.entries[0].createdAt > before.outcome!.createdAt);
    await correct(f);
    await correct(f, payload());
    assert.deepEqual(await state(f), attached);
    await locked(f, async (tx) => {
      await tx.outcome.update({ where: { id: f.outcomeId }, data: { outcomeDate: "2026-01-02" } });
      await correctOutcomeMedical(tx, f.outcomeId, f.animalId, undefined, editorId);
    });
    const moved = await state(f);
    assert.equal(moved.entries[0].completedDate, "2026-01-02");
    assert.equal(moved.events.length, 2);
    assert.equal(moved.events[1].action, "EDITED");
    assert.equal(moved.events[1].actorId, editorId);
    assert.deepEqual(moved.events[1].before, { completedDate: "2026-01-03" });
    assert.deepEqual(moved.events[1].after, { completedDate: "2026-01-02" });
    assert.deepEqual(moved.euthanasia, attached.euthanasia);
    assert.deepEqual(moved.death, attached.death);
    assert.equal(moved.activities.length, 2);
  });
}

test("euthanasia corrections clear optional fields and audit all changed values without changing provenance", async () => {
  const f = await fixture();
  await create(f);
  const before = await state(f);
  await correct(f, { ...euthanasia(), source: "OUTSIDE_VET", vetPartnerId: clinicId, vetName: "Clinic vet", performedById: null, performedByName: "Dr Historical", reasonCategory: "OTHER", reasonNotes: "Corrected reason", drug: "Corrected agent", dose: "Corrected amount mL", route: "Corrected route", witness: " ", bodyDisposition: " " });
  const saved = await state(f);
  assert.equal(saved.entries[0].createdById, recorderId);
  assert.equal(saved.entries[0].createdAt.getTime(), before.entries[0].createdAt.getTime());
  assert.deepEqual(saved.outcome, before.outcome);
  assert.deepEqual(saved.events[1].before, { source: "IN_HOUSE", vetPartnerId: null, vetName: null, performedById: performerId, performedByName: null, reasonCategory: "MEDICAL", reasonNotes: "Clinical reason", drug: "Recorded agent", dose: "Recorded amount mL", route: "Recorded route", witness: "Recorded witness", bodyDisposition: "Pending" });
  assert.deepEqual(saved.events[1].after, { source: "OUTSIDE_VET", vetPartnerId: clinicId, vetName: "Clinic vet", performedById: null, performedByName: "Dr Historical", reasonCategory: "OTHER", reasonNotes: "Corrected reason", drug: "Corrected agent", dose: "Corrected amount mL", route: "Corrected route", witness: null, bodyDisposition: null });
  assert.equal(saved.activities[1].activityType, "MEDICAL_ENTRY_EDITED");
  assert.equal(saved.euthanasia[0].performedByName, "Dr Historical");
  await correct(f, { ...euthanasia(), reasonNotes: null, witness: null, bodyDisposition: null });
  const inside = await state(f);
  assert.equal(inside.entries[0].vetPartnerId, null);
  assert.equal(inside.entries[0].vetName, null);
  assert.equal(inside.euthanasia[0].performedByName, null);
  assert.equal(inside.euthanasia[0].reasonNotes, null);
});

test("death corrects known/unknown causes, circumstances and each necropsy state without invented attribution", async () => {
  const f = await fixture("DECEASED");
  await create(f, death());
  await correct(f, { ...death(), circumstances: "OTHER", circumstanceNotes: "Recorded circumstances", causeKnowledge: "KNOWN", cause: "Recorded cause", necropsyRequested: true, bodyDisposition: "Pending" });
  let saved = await state(f);
  assert.deepEqual(saved.events[1].before, { circumstances: "FOUND_DEAD", circumstanceNotes: null, cause: null, necropsyRequested: null, bodyDisposition: null });
  assert.deepEqual(saved.events[1].after, { circumstances: "OTHER", circumstanceNotes: "Recorded circumstances", cause: "Recorded cause", necropsyRequested: true, bodyDisposition: "Pending" });
  await correct(f, { ...death(), cause: "Stale typed cause", necropsyRequested: false });
  saved = await state(f);
  assert.equal(saved.death[0].cause, null);
  assert.equal(saved.death[0].circumstanceNotes, null);
  assert.equal(saved.death[0].bodyDisposition, null);
  assert.equal(saved.death[0].necropsyRequested, false);
  await correct(f, death());
  saved = await state(f);
  assert.equal(saved.death[0].necropsyRequested, null);
  assert.equal(saved.entries[0].source, null);
  assert.equal(saved.entries[0].administeredById, null);
});

test("historical people and clinic remain usable after names change or the clinic is retired", async () => {
  const f = await fixture();
  await create(f, { ...euthanasia(), source: "OUTSIDE_VET", vetPartnerId: clinicId });
  try {
    await prisma.partner.update({ where: { id: clinicId }, data: { isActive: false } });
    await prisma.person.update({ where: { id: performerId }, data: { name: `Renamed performer ${runId}` } });
    await correct(f, { ...euthanasia(), source: "OUTSIDE_VET", vetPartnerId: clinicId, witness: "Corrected witness" });
    assert.equal((await state(f)).euthanasia[0].performedById, performerId);
    await assert.rejects(() => prisma.person.delete({ where: { id: performerId } }));
    await assert.rejects(() => prisma.person.delete({ where: { id: authorizerId } }));
  } finally {
    await prisma.partner.update({ where: { id: clinicId }, data: { isActive: true } });
  }
});

const invalidEuthanasia = () => [
  ...["reasonCategory", "authorizedById", "performedById", "drug", "dose", "route", "source"].map((field) => ({ label: `missing ${field}`, patch: { [field]: undefined } })),
  { label: "unknown authorizer", patch: { authorizedById: missingId } },
  { label: "unknown performer", patch: { performedById: missingId } },
  { label: "both performers", patch: { performedByName: "Dr Example" } },
  { label: "in-house free name", patch: { performedById: null, performedByName: "Dr Example" } },
  { label: "other without notes", patch: { reasonCategory: "OTHER", reasonNotes: " " } },
  { label: "before intake", patch: { source: "BEFORE_INTAKE" } },
  { label: "in-house clinic", patch: { vetPartnerId: clinicId } },
  { label: "in-house vet", patch: { vetName: "Dr Example" } },
  ...[missingId, closedClinicId, rescueId].map((vetPartnerId) => ({ label: `invalid clinic ${vetPartnerId}`, patch: { source: "OUTSIDE_VET", vetPartnerId } })),
  { label: "clinic without performer", patch: { source: "OUTSIDE_VET", vetPartnerId: clinicId, performedById: null } },
  ...["drug", "dose", "route", "witness", "bodyDisposition", "vetName", "performedByName"].map((field) => ({ label: `overlong ${field}`, patch: { [field]: "x".repeat(201) } })),
  { label: "overlong reason", patch: { reasonNotes: "x".repeat(2001) } },
  { label: "irrelevant fields", patch: { circumstances: "FOUND_DEAD" } },
];

test("direct create and correction calls validate all euthanasia core facts, references and source restrictions atomically", async (t) => {
  for (const { label, patch } of invalidEuthanasia()) await t.test(label, async () => {
    const f = await fixture();
    const medical = { ...euthanasia(), ...patch } as OutcomeMedicalDetailsInput;
    await refusedUnchanged(f, () => create(f, medical), (error) => error instanceof MedicalEntryRefusal);
    await create(f);
    await refusedUnchanged(f, () => correct(f, medical), (error) => error instanceof MedicalEntryRefusal);
  });
});

test("direct death calls reject missing facts, invented attribution, irrelevant and wrong-type payloads", async (t) => {
  const patches = [
    { circumstances: undefined }, { causeKnowledge: undefined }, { necropsyRequested: undefined },
    { causeKnowledge: "KNOWN", cause: " " }, { circumstances: "OTHER", circumstanceNotes: " " },
    { source: "IN_HOUSE" }, { administeredById: recorderId }, { drug: "Agent" },
    { bodyDisposition: "x".repeat(201) }, { circumstanceNotes: "x".repeat(2001) },
    { causeKnowledge: "KNOWN", cause: "x".repeat(2001) }, { necropsyRequested: "false" },
  ];
  for (const [index, patch] of patches.entries()) await t.test(`invalid death payload ${index}`, async () => {
    const f = await fixture("DECEASED");
    const medical = { ...death(), ...patch } as OutcomeMedicalDetailsInput;
    await refusedUnchanged(f, () => create(f, medical), (error) => error instanceof MedicalEntryRefusal);
    await create(f, death());
    await refusedUnchanged(f, () => correct(f, medical), (error) => error instanceof MedicalEntryRefusal);
  });
  const f = await fixture("DECEASED");
  await refusedUnchanged(f, () => create(f, euthanasia()), (error) => error instanceof MedicalEntryRefusal);
  await refusedUnchanged(f, () => correct(f, euthanasia()), (error) => error instanceof MedicalEntryRefusal);
  await refusedUnchanged(f, () => locked(f, (tx) => recordOutcomeMedical(tx, f.outcomeId, f.animalId, undefined as unknown as OutcomeMedicalDetailsInput, recorderId)), fieldRefusal("medical"));
  await refusedUnchanged(f, () => correct(f, null as unknown as OutcomeMedicalDetailsInput), fieldRefusal("medical"));
});

test("the stored outcome controls type, identity and reversal refusals including legacy gaps", async () => {
  for (const type of ["ADOPTION", "TRANSFER_OUT", "RETURN_TO_OWNER", "OTHER"] as const) {
    const f = await fixture(type);
    await refusedUnchanged(f, () => create(f), fieldRefusal("medical"));
    await refusedUnchanged(f, () => correct(f), fieldRefusal("medical"));
  }
  const f = await fixture();
  const other = await fixture();
  await refusedUnchanged(f, () => create({ ...f, animalId: other.animalId }), conflict);
  await refusedUnchanged(f, () => correct({ ...f, animalId: other.animalId }), conflict);
  await assert.rejects(() => create({ ...f, outcomeId: missingId }), (error) => error instanceof NotFoundError);
  await prisma.outcome.update({ where: { id: f.outcomeId }, data: { reversedAt: new Date(), reversedById: editorId, reversalReason: "Wrong animal" } });
  await refusedUnchanged(f, () => create(f), conflict);
  await refusedUnchanged(f, () => correct(f, euthanasia()), conflict);
  await refusedUnchanged(f, () => correct(f), conflict);
});

test("malformed links, status, kind and detail tables are refused before correction writes", async (t) => {
  const corruptions: { label: string; run: (f: Fixture, entryId: string) => Promise<unknown> }[] = [
    { label: "wrong animal", run: async (_f, id) => { const other = await fixture(); return prisma.medicalEntry.update({ where: { id }, data: { animalId: other.animalId } }); } },
    { label: "wrong kind", run: (_f, id) => prisma.medicalEntry.update({ where: { id }, data: { kind: "DEATH" } }) },
    { label: "scheduled", run: (_f, id) => prisma.medicalEntry.update({ where: { id }, data: { status: "SCHEDULED", dueDate: "2026-01-03" } }) },
    { label: "missing details", run: (_f, entryId) => prisma.euthanasiaDetails.delete({ where: { entryId } }) },
    { label: "opposite details", run: (_f, entryId) => prisma.deathDetails.create({ data: { entryId, circumstances: "FOUND_DEAD" } }) },
    { label: "ordinary details", run: (_f, entryId) => prisma.microchipDetails.create({ data: { entryId } }) },
    { label: "voided link", run: (_f, id) => prisma.medicalEntry.update({ where: { id }, data: { voidedAt: new Date(), voidedById: editorId, voidReason: "Wrong record" } }) },
  ];
  for (const { label, run } of corruptions) await t.test(label, async () => {
    const f = await fixture();
    const { entryId } = await create(f);
    await run(f, entryId);
    await refusedUnchanged(f, () => correct(f, euthanasia()), conflict);
    await refusedUnchanged(f, () => reverse(f), conflict);
  });
});

const reversalAt = new Date("2026-10-17T14:00:00.123Z");
async function markReversed(tx: TransactionClient, f: Fixture) {
  await tx.outcome.update({ where: { id: f.outcomeId }, data: {
    reversedAt: reversalAt, reversedById: editorId, reversalReason: "Recorded against the wrong animal.",
  } });
}
const reverse = (f: Fixture) => locked(f, async (tx) => {
  await markReversed(tx, f);
  return voidOutcomeMedical(tx, f.outcomeId, f.animalId);
});

test("legacy reversals and ordinary outcomes with no link write no medical rows or audit", async () => {
  for (const type of ["EUTHANIZED", "DECEASED", "ADOPTION", "TRANSFER_OUT", "RETURN_TO_OWNER", "OTHER"] as const) {
    const f = await fixture(type);
    await reverse(f);
    const saved = await state(f);
    assert.equal(saved.entries.length, 0);
    assert.equal(saved.events.length, 0);
    assert.equal(saved.activities.length, 0);
    assert.equal(saved.outcome!.reversedAt!.getTime(), reversalAt.getTime());
  }
});

for (const [type, payload] of [["EUTHANIZED", euthanasia], ["DECEASED", death]] as const) {
  test(`${type} void uses the stored reversal's actor, reason and exact instant once`, async () => {
    const f = await fixture(type);
    await create(f, payload());
    const before = await state(f);
    await refusedUnchanged(f, () => locked(f, (tx) => voidOutcomeMedical(tx, f.outcomeId, f.animalId)), conflict);
    await reverse(f);
    const saved = await state(f);
    assert.equal(saved.entries[0].voidedAt!.getTime(), reversalAt.getTime());
    assert.equal(saved.entries[0].voidedById, editorId);
    assert.equal(saved.entries[0].voidReason, saved.outcome!.reversalReason);
    assert.equal(saved.events.length, 2);
    // The pinned reversal can precede today's documentation instant.
    const event = saved.events.find((event) => event.action === "VOIDED")!;
    assert.equal(event.createdAt.getTime(), reversalAt.getTime());
    assert.equal(event.actorId, editorId);
    assert.deepEqual(event.after, { voidReason: saved.outcome!.reversalReason });
    const activity = saved.activities.find((row) => row.activityType === "MEDICAL_ENTRY_VOIDED")!;
    assert.equal(activity.changedAt.getTime(), reversalAt.getTime());
    assert.equal(activity.changedById, editorId);
    assert.deepEqual(saved.euthanasia, before.euthanasia);
    assert.deepEqual(saved.death, before.death);
    assert.equal(saved.entries[0].outcomeId, f.outcomeId);
    await refusedUnchanged(f, () => locked(f, (tx) => voidOutcomeMedical(tx, f.outcomeId, f.animalId)), conflict);
    await refusedUnchanged(f, () => correct(f, payload()), conflict);
    await refusedUnchanged(f, () => create(f, payload()), conflict);
  });
}

test("a reversal cannot silently void a mismatched day, outcome type or incomplete reversal", async () => {
  for (const data of [
    { outcomeDate: "2026-01-02" }, { type: "OTHER" as const },
    { reversedById: null }, { reversalReason: " " }, { reversedAt: null },
  ]) {
    const f = await fixture();
    await create(f);
    await refusedUnchanged(f, () => locked(f, async (tx) => {
      await markReversed(tx, f);
      await tx.outcome.update({ where: { id: f.outcomeId }, data });
      return voidOutcomeMedical(tx, f.outcomeId, f.animalId);
    }), conflict);
  }
});

test("the unique outcome link includes voided records across both medical kinds", async () => {
  const f = await fixture();
  await create(f);
  await reverse(f);
  await refusedUnchanged(f, () => prisma.medicalEntry.create({ data: {
    animalId: f.animalId, outcomeId: f.outcomeId, kind: "DEATH", status: "COMPLETED",
    completedDate: "2026-01-03", createdById: editorId,
  } }), (error) => error instanceof Error && "code" in error && error.code === "P2002");
});

test("a failed void audit rolls back the caller's reversal and listing writes too", async () => {
  for (const type of ["EUTHANIZED", "DECEASED"] as const) {
    for (const model of ["medicalEntryEvent", "animalActivityLog"] as const) {
      const f = await fixture(type);
      await create(f, type === "EUTHANIZED" ? euthanasia() : death());
      await refusedUnchanged(f, () => locked(f, async (tx) => {
        await markReversed(tx, f);
        await tx.animal.update({ where: { id: f.animalId }, data: { listingStatus: "DRAFT", archiveReason: null } });
        return voidOutcomeMedical(failingAudit(tx, model), f.outcomeId, f.animalId);
      }), (error) => error instanceof Error && error.message === "Audit unavailable");
    }
  }
});

test("void retains linked documents and file metadata and leaves all other care unchanged", async () => {
  const f = await fixture("DECEASED");
  const { entryId } = await create(f, death());
  await prisma.medicalDocument.create({ data: {
    animalId: f.animalId, entryId, name: "Clinical paperwork", type: "VET_RECORD",
    pathname: `test-only/${runId}/retained.pdf`, contentType: "application/pdf", sizeBytes: 123,
    uploadedById: recorderId,
  } });
  await prisma.medicalEntry.create({ data: {
    animalId: f.animalId, kind: "MICROCHIP", status: "SCHEDULED", dueDate: "2026-01-04", createdById: recorderId,
  } });
  await prisma.medicalCondition.create({ data: {
    animalId: f.animalId, type: "CONDITION", name: "Existing condition", status: "CHRONIC", createdById: recorderId,
  } });
  await prisma.careEpisode.create({ data: {
    animalId: f.animalId, type: "UNDER_VET_CARE", startDate: "2026-01-01", reason: "Existing care", openedById: recorderId,
  } });
  const item = await prisma.medicalItem.create({ data: { name: `Existing medication ${runId}`, kind: "MEDICATION" } });
  try {
    await prisma.medicationOrder.create({ data: {
      animalId: f.animalId, itemId: item.id, doseAmount: 1, doseUnit: "TABLET", route: "ORAL", frequency: "SID",
      startDate: "2026-01-01", firstSlot: "AM", createdById: recorderId,
    } });
    const remaining = async () => ({
      documents: await prisma.medicalDocument.findMany({ where: { animalId: f.animalId } }),
      scheduled: await prisma.medicalEntry.findMany({ where: { animalId: f.animalId, id: { not: entryId } } }),
      conditions: await prisma.medicalCondition.findMany({ where: { animalId: f.animalId } }),
      episodes: await prisma.careEpisode.findMany({ where: { animalId: f.animalId } }),
      orders: await prisma.medicationOrder.findMany({ where: { animalId: f.animalId } }),
    });
    const before = await remaining();
    await reverse(f);
    assert.deepEqual(await remaining(), before);
  } finally {
    await prisma.medicationOrder.deleteMany({ where: { itemId: item.id } });
    await prisma.medicalItem.delete({ where: { id: item.id } });
  }
});

const today = calendarDay("2026-10-17");
const ordinaryInput = () => ({ kind: "MICROCHIP", source: "IN_HOUSE", completedDate: calendarDay("2026-01-03"), chipNumber: `OWNED${runId.toUpperCase()}` } as const);
const ownedRefusal = (error: unknown) => error instanceof MedicalEntryRefusal && /through the outcome/.test(error.message);

test("generic creation and scheduling reject forged end-of-life kinds and outcome links", async () => {
  const f = await fixture();
  for (const forged of [{ kind: "EUTHANASIA" }, { kind: "DEATH" }, { outcomeId: f.outcomeId }]) {
    const input = { ...ordinaryInput(), animalId: f.animalId, dueDate: today, ...forged };
    await refusedUnchanged(f, () => locked(f, (tx) => recordMedicalEntry(tx, input as RecordMedicalEntryInput & { animalId: string }, recorderId, today)), ownedRefusal);
    await refusedUnchanged(f, () => locked(f, (tx) => scheduleMedicalEntry(tx, input as ScheduleMedicalEntryInput, recorderId, today)), ownedRefusal);
  }
});

test("every generic mutation refuses stored end-of-life kinds or outcome ownership, including forged ordinary IDs", async (t) => {
  for (const kind of ["EUTHANASIA", "DEATH", "MICROCHIP"] as const) {
    for (const linked of [false, true]) {
      if (kind === "MICROCHIP" && !linked) continue;
      for (const status of ["SCHEDULED", "COMPLETED", "DECLINED"] as const) await t.test(`${kind} ${status} ${linked ? "linked" : "unlinked"}`, async () => {
        const f = await fixture();
        const entry = await prisma.medicalEntry.create({ data: {
          animalId: f.animalId, outcomeId: linked ? f.outcomeId : null, kind, status,
          dueDate: today, completedDate: status === "COMPLETED" ? "2026-01-03" : null,
          source: kind === "DEATH" ? null : "IN_HOUSE", createdById: recorderId,
        } });
        const mutations = [
          (tx: TransactionClient) => editMedicalEntry(tx, entry.id, ordinaryInput(), editorId, today),
          (tx: TransactionClient) => recordScheduledMedicalEntry(tx, entry.id, ordinaryInput(), editorId, today),
          (tx: TransactionClient) => rescheduleMedicalEntry(tx, entry.id, calendarDay("2026-10-18"), editorId, today),
          (tx: TransactionClient) => declineMedicalEntry(tx, entry.id, "Entered in error", editorId),
          (tx: TransactionClient) => voidMedicalEntry(tx, entry.id, "Entered in error", editorId),
        ];
        for (const mutate of mutations) await refusedUnchanged(f, () => locked(f, mutate), ownedRefusal);
      });
    }
  }
});

test("forged clinical input cannot edit or complete ordinary care by changing its kind", async () => {
  const f = await fixture();
  const entry = await prisma.medicalEntry.create({ data: {
    animalId: f.animalId, kind: "MICROCHIP", status: "SCHEDULED", dueDate: today, createdById: recorderId,
  } });
  for (const kind of ["EUTHANASIA", "DEATH"] as const) {
    const input = { ...ordinaryInput(), kind } as unknown as RecordMedicalEntryInput;
    await refusedUnchanged(f, () => locked(f, (tx) => recordScheduledMedicalEntry(tx, entry.id, input, editorId, today)), ownedRefusal);
    await refusedUnchanged(f, () => locked(f, (tx) => editMedicalEntry(tx, entry.id, input, editorId, today)), ownedRefusal);
  }
});

/** Fail an audit write after persistence to prove the caller's transaction rolls it all back. */
function failingAudit(tx: TransactionClient, model: "medicalEntryEvent" | "animalActivityLog") {
  return new Proxy(tx, { get(target, key, receiver) {
    if (key !== model) return Reflect.get(target, key, receiver);
    return new Proxy(target[model], { get(delegate, operation) {
      if (operation === "create") return () => { throw new Error("Audit unavailable"); };
      return Reflect.get(delegate, operation);
    } });
  } });
}

test("failed event or activity writes roll back entry/detail creation, attachment and correction with the caller's outcome write", async () => {
  for (const model of ["medicalEntryEvent", "animalActivityLog"] as const) {
    for (const mode of ["create", "attach", "correct"] as const) {
      const f = await fixture();
      if (mode === "correct") await create(f);
      await refusedUnchanged(f, () => locked(f, async (tx) => {
        await tx.outcome.update({ where: { id: f.outcomeId }, data: { outcomeDate: "2026-01-02", notes: "Changed outcome" } });
        const broken = failingAudit(tx, model);
        return mode === "create"
          ? recordOutcomeMedical(broken, f.outcomeId, f.animalId, euthanasia(), editorId)
          : correctOutcomeMedical(broken, f.outcomeId, f.animalId, { ...euthanasia(), witness: "New witness" }, editorId);
      }), (error) => error instanceof Error && error.message === "Audit unavailable");
    }
  }
});

test("concurrent create retries serialize behind the caller's lock and leave one record", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([create(f), create(f)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ConflictError);
  const saved = await state(f);
  assert.equal(saved.entries.length, 1);
  assert.equal(saved.events.length, 1);
  assert.equal(saved.activities.length, 1);
});

test("concurrent corrections use current before-values, and an identical retry writes no audit", async () => {
  const f = await fixture();
  await create(f);
  await Promise.all([
    correct(f, { ...euthanasia(), witness: "First correction" }),
    correct(f, { ...euthanasia(), witness: "Second correction" }),
  ]);
  const saved = await state(f);
  assert.equal(saved.events.length, 3);
  assert.deepEqual(saved.events[1].before, { witness: "Recorded witness" });
  assert.deepEqual(saved.events[2].before, saved.events[1].after);
  assert.deepEqual(saved.events[2].after, { witness: saved.euthanasia[0].witness });
  const payload = { ...euthanasia(), witness: "Same correction" };
  await Promise.all([correct(f, payload), correct(f, payload)]);
  assert.equal((await state(f)).events.length, 4);
  const unchanged = await state(f);
  await correct(f, payload);
  assert.deepEqual(await state(f), unchanged);
});

test("a waiting correction rereads a reversal committed by the lock holder", async () => {
  const f = await fixture();
  await create(f);
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let acquired!: (pid: number) => void;
  const acquiredPid = new Promise<number>((resolve) => { acquired = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    await lockAnimal(tx, f.animalId);
    const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    acquired(pid);
    await released;
    await tx.outcome.update({ where: { id: f.outcomeId }, data: {
      reversedAt: new Date(), reversedById: editorId, reversalReason: "Wrong animal",
    } });
  }, { timeout: 15_000 });
  const pid = await Promise.race([acquiredPid, holder as Promise<never>]);
  let settled = false;
  const waiting = prisma.$transaction(async (tx) => {
    await lockAnimal(tx, f.animalId);
    return correctOutcomeMedical(tx, f.outcomeId, f.animalId, euthanasia(), editorId);
  }, { timeout: 15_000 }).then((value) => ({ value }), (error: unknown) => ({ error })).finally(() => { settled = true; });
  let blocked = false;
  try {
    const deadline = Date.now() + 5_000;
    while (!settled && Date.now() < deadline) {
      const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
      if (count) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    release();
    await Promise.all([holder, waiting]);
  }
  assert.equal(blocked, true, "correction waited on this animal lock");
  const result = await waiting;
  assert.ok("error" in result && result.error instanceof ConflictError);
  const saved = await state(f);
  assert.equal(saved.events.length, 1);
  assert.equal(saved.entries[0].completedDate, "2026-01-03");
});

// Exercise the production writers together, including the transaction that owns archiving.
import { recordOutcome, recordOutcomeCorrection } from "@/app/lib/services/outcome-recording";
import { recordOutcomeReversal } from "@/app/lib/services/outcome-reversal";
import { OutcomeFormSchema } from "@/app/lib/zod-schemas/outcome.schema";
import { findOutcomeMedical, outcomeMedicalFormValues } from "@/app/lib/data/animals/outcome-medical";
import { findEventNames, findMedicalHistoryPage, findRecentMedicalEntries, findVaccinesAndTests } from "@/app/lib/data/animals/medical-entry";

async function activeFixture(type: OutcomeType) {
  const f = await fixture(type);
  await prisma.outcome.delete({ where: { id: f.outcomeId } });
  await prisma.animal.update({ where: { id: f.animalId }, data: { listingStatus: "DRAFT", archiveReason: null } });
  await prisma.intake.create({ data: { animalId: f.animalId, staffMemberId: recorderId, type: "STRAY", intakeDate: "2026-01-01" } });
  return f;
}
const formValues = (outcomeType: OutcomeType, medical?: OutcomeMedicalDetailsInput, day = "2026-01-03", notes = "") =>
  OutcomeFormSchema.parse({ outcomeType, outcomeDate: day, medical, notes });
async function activate(type: OutcomeType, medical: OutcomeMedicalDetailsInput) {
  const f = await activeFixture(type);
  await prisma.$transaction((tx) => recordOutcome(tx, { animalId: f.animalId, values: formValues(type, medical) }, recorderId));
  f.outcomeId = (await prisma.outcome.findFirstOrThrow({ where: { animalId: f.animalId } })).id;
  return f;
}
for (const [type, payload] of [["EUTHANIZED", euthanasia], ["DECEASED", death]] as const) {
  test(`${type} production creation, correction, reads and reversal share immutable links and audit`, async () => {
    const f = await activate(type, payload());
    const entry = (await state(f)).entries[0];
    const projection = await findOutcomeMedical(f.outcomeId);
    assert.equal(projection?.outcomeId, f.outcomeId);
    assert.equal(outcomeMedicalFormValues(projection)?.kind, entry.kind);
    const names = await findEventNames(prisma, [projection!]);
    if (type === "EUTHANIZED") {
      assert.match(names[authorizerId], /Authorizer without account/);
      assert.equal(names[performerId], (await prisma.person.findUniqueOrThrow({ where: { id: performerId } })).name);
    }
    const beforeNotes = await state(f);
    await recordOutcomeCorrection(f.outcomeId, formValues(type, undefined, "2026-01-03", "Outcome note"), editorId);
    const notes = await state(f);
    assert.deepEqual(notes.entries, beforeNotes.entries);
    assert.deepEqual(notes.events, beforeNotes.events);
    await recordOutcomeCorrection(f.outcomeId, formValues(type, { ...payload(), bodyDisposition: "Documented" }, "2026-01-02", "Outcome note"), editorId);
    const corrected = await state(f);
    assert.equal(corrected.entries[0].completedDate, "2026-01-02");
    assert.equal(corrected.outcome?.outcomeDate, "2026-01-02");
    assert.equal(corrected.events.length, 2);
    assert.equal(corrected.events[1].actorId, editorId);
    const unchanged = await recordOutcomeCorrection(f.outcomeId, formValues(type, { ...payload(), bodyDisposition: "Documented" }, "2026-01-02", "Outcome note"), editorId);
    assert.equal(unchanged.status, "unchanged");
    assert.deepEqual(await state(f), corrected);
    assert.equal((await findRecentMedicalEntries(prisma, f.animalId, 5)).length, 1);
    await prisma.$transaction((tx) => recordOutcomeReversal(tx, f.outcomeId, "Wrong animal", editorId));
    const reversed = await state(f);
    assert.equal(reversed.entries[0].voidedAt?.getTime(), reversed.outcome?.reversedAt?.getTime());
    assert.equal(reversed.entries[0].voidedById, editorId);
    assert.equal(reversed.entries[0].voidReason, "Wrong animal");
    assert.equal((await findRecentMedicalEntries(prisma, f.animalId, 5)).length, 0);
    assert.equal((await findVaccinesAndTests(prisma, f.animalId)).length, 0);
    const history = await findMedicalHistoryPage(prisma, f.animalId, { kinds: [entry.kind], page: 1, perPage: 10, timeZone: "America/New_York" });
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].source, "ENTRY");
    assert.ok((await findOutcomeMedical(f.outcomeId))?.voidedAt);
    await prisma.$transaction((tx) => recordOutcome(tx, { animalId: f.animalId, values: formValues(type, payload()) }, recorderId));
    const entries = (await state(f)).entries;
    assert.equal(entries.length, 2);
    assert.notEqual(entries[0].outcomeId, entries[1].outcomeId);
  });
  test(`${type} production audit failure rolls back archive, outcome and all medical writes`, async () => {
    for (const model of ["medicalEntryEvent", "animalActivityLog"] as const) {
      const f = await activeFixture(type);
      await refusedUnchanged(f, () => prisma.$transaction((tx) => recordOutcome(failingAudit(tx, model), { animalId: f.animalId, values: formValues(type, payload()) }, recorderId)), (error) => error instanceof Error && /Audit unavailable/.test(error.message));
    }
  });
  test(`${type} two concurrent production creates record exactly one outcome and clinical event`, async () => {
    const f = await activeFixture(type);
    const create = () => prisma.$transaction((tx) => recordOutcome(tx, { animalId: f.animalId, values: formValues(type, payload()) }, recorderId));
    const results = await Promise.allSettled([create(), create()]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await prisma.outcome.count({ where: { animalId: f.animalId } }), 1);
    assert.equal((await state(f)).events.length, 1);
  });
}

test("production creation rejects a missing clinical payload and leaves an active animal intact", async () => {
  const f = await activeFixture("DECEASED");
  await refusedUnchanged(f, () => prisma.$transaction((tx) => recordOutcome(tx, { animalId: f.animalId, values: formValues("DECEASED") }, recorderId)), fieldRefusal("medical"));
});
test("concurrent production clinical corrections use current before values and identical retry is a no-op", async () => {
  const f = await activate("DECEASED", death());
  const change = (disposition: string) => recordOutcomeCorrection(f.outcomeId, formValues("DECEASED", { ...death(), bodyDisposition: disposition }), editorId);
  await Promise.all([change("First"), change("Second")]);
  const saved = await state(f);
  const events = saved.events.filter((event) => event.action === "EDITED");
  assert.equal(events.length, 2);
  assert.deepEqual(events[1].before, events[0].after);
  const current = saved.death[0].bodyDisposition!;
  assert.equal((await change(current)).status, "unchanged");
  assert.deepEqual(await state(f), saved);
});
test("production non-latest reversal voids clinical entry while leaving the current listing intact", async () => {
  const f = await activate("DECEASED", death());
  await prisma.intake.create({ data: { animalId: f.animalId, staffMemberId: recorderId, type: "STRAY", intakeDate: "2026-01-05" } });
  await prisma.animal.update({ where: { id: f.animalId }, data: { listingStatus: "PUBLISHED", archiveReason: null } });
  await prisma.$transaction((tx) => recordOutcomeReversal(tx, f.outcomeId, "Mistaken historical outcome", editorId));
  const saved = await state(f);
  assert.equal(saved.animal?.listingStatus, "PUBLISHED");
  assert.ok(saved.entries[0].voidedAt);
});
test("production correction authorizes the locked stored link and rolls back a refused linked day", async () => {
  const f = await activate("DECEASED", death());
  await refusedUnchanged(f, () => recordOutcomeCorrection(f.outcomeId, formValues("DECEASED", undefined, "2026-01-02"), editorId, { authorize: (operation) => {
    assert.deepEqual(operation, { type: "DECEASED", linked: true, dayChanges: true, medicalSupplied: false });
    throw new Error("permission refused");
  } }), (error) => error instanceof Error && error.message === "permission refused");
});

test("a production clinical refusal rolls back the outcome day and notes", async () => {
  const f = await activate("EUTHANIZED", euthanasia());
  await refusedUnchanged(f, () => recordOutcomeCorrection(f.outcomeId,
    formValues("EUTHANIZED", { ...euthanasia(), authorizedById: missingId }, "2026-01-02", "Updated notes"), editorId),
    fieldRefusal("medical.authorizedById"));
});

test("a production reversal failure rolls back reversal, listing restoration and linked void", async () => {
  const f = await activate("DECEASED", death());
  await refusedUnchanged(f, () => prisma.$transaction((tx) =>
    recordOutcomeReversal(failingAudit(tx, "medicalEntryEvent"), f.outcomeId, "Wrong animal", editorId)),
    (error) => error instanceof Error && error.message === "Audit unavailable");
});

async function productionWhileHeld(f: Fixture, waiting: () => Promise<unknown>, write: (tx: TransactionClient) => Promise<unknown>) {
  let release!: () => void, acquired!: (pid: number) => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const acquiredPid = new Promise<number>((resolve) => { acquired = resolve; });
  const holder = prisma.$transaction(async (tx) => {
    await lockAnimal(tx, f.animalId);
    const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    acquired(pid); await gate; await write(tx);
  }, { timeout: 20_000 });
  const pid = await Promise.race([acquiredPid, holder as Promise<never>]);
  let settled = false, blocked = false;
  const result = waiting().then((value) => ({ value }), (error: unknown) => ({ error })).finally(() => { settled = true; });
  try {
    const deadline = Date.now() + 5_000;
    while (!settled && Date.now() < deadline) {
      const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
      if (count) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally { release(); await Promise.all([holder, result]); }
  assert.ok(blocked, "production writer waited on the animal lock");
  return result;
}
test("production correction waits behind reversal and preserves its linked void", async () => {
  const f = await activate("DECEASED", death());
  const result = await productionWhileHeld(f,
    () => recordOutcomeCorrection(f.outcomeId, formValues("DECEASED", { ...death(), bodyDisposition: "Late correction" }), editorId, { timeout: 20_000 }),
    (tx) => recordOutcomeReversal(tx, f.outcomeId, "Wrong animal", recorderId));
  assert.ok("error" in result && result.error instanceof ConflictError);
  const saved = await state(f);
  assert.equal(saved.events.length, 2);
  assert.equal(saved.death[0].bodyDisposition, null);
  assert.ok(saved.entries[0].voidedAt);
});
test("production reversal waits behind a clinical correction and voids the current day and details", async () => {
  const f = await activate("DECEASED", death());
  const result = await productionWhileHeld(f,
    () => prisma.$transaction((tx) => recordOutcomeReversal(tx, f.outcomeId, "Wrong animal", editorId), { timeout: 20_000 }),
    async (tx) => {
      await tx.outcome.update({ where: { id: f.outcomeId }, data: { outcomeDate: "2026-01-02" } });
      await correctOutcomeMedical(tx, f.outcomeId, f.animalId, { ...death(), bodyDisposition: "Corrected before reversal" }, recorderId);
    });
  assert.ok("value" in result);
  const saved = await state(f);
  assert.equal(saved.entries[0].completedDate, "2026-01-02");
  assert.equal(saved.death[0].bodyDisposition, "Corrected before reversal");
  assert.equal(saved.events.length, 3);
  assert.equal(saved.events[2].action, "VOIDED");
});

test("a linked historical outcome correction uses its own stay and rolls back at the next intake boundary", async () => {
  const f = await activate("DECEASED", death());
  await prisma.intake.create({ data: { animalId: f.animalId, staffMemberId: recorderId, type: "STRAY", intakeDate: "2026-01-05" } });
  await prisma.animal.update({ where: { id: f.animalId }, data: { listingStatus: "DRAFT", archiveReason: null } });
  await recordOutcomeCorrection(f.outcomeId, formValues("DECEASED", undefined, "2026-01-04"), editorId);
  const saved = await state(f);
  assert.equal(saved.entries[0].completedDate, "2026-01-04");
  assert.equal(saved.animal?.listingStatus, "DRAFT");
  await refusedUnchanged(f, () => recordOutcomeCorrection(f.outcomeId, formValues("DECEASED", undefined, "2026-01-06"), editorId),
    (error) => error instanceof Error && error.name === "TimelineOrderError");
});
