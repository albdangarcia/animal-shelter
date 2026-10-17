import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import {
  OutcomeMedicalCreateSchema,
  OutcomeMedicalCorrectionSchema,
  type OutcomeMedicalDetailsInput,
} from "@/app/lib/zod-schemas/outcome-medical.schemas";
import { MedicalEntryRefusal } from "./medical-entry-values";
import { checkVetClinic } from "./medical-entry";
import { outcomeMedicalValues, type OutcomeMedicalValues } from "./outcome-medical-values";
import { REVERSAL_REASON_MAX_LENGTH } from "@/app/lib/zod-schemas/outcome.schema";

/**
 * Outcome-owned medical writes. The caller holds the animal lock, validates
 * the outcome timeline and owns the transaction. Reads here use current stored
 * values; no outcome snapshot or clinical day is accepted from a form.
 */
const integrity = () => new ConflictError(
  "The outcome and its medical record disagree. Resolve the linked record before continuing.",
);

async function readOutcome(tx: TransactionClient, outcomeId: string, animalId: string) {
  const outcome = await tx.outcome.findUnique({ where: { id: outcomeId } });
  if (!outcome) throw new NotFoundError("Outcome not found.");
  if (outcome.animalId !== animalId) throw integrity();
  return outcome;
}

async function readClinicalOutcome(tx: TransactionClient, outcomeId: string, animalId: string) {
  const outcome = await readOutcome(tx, outcomeId, animalId);
  if (outcome.type !== "EUTHANIZED" && outcome.type !== "DECEASED") {
    throw new MedicalEntryRefusal("This outcome type cannot have end-of-life medical details.", "medical");
  }
  return outcome;
}

type StoredOutcome = Awaited<ReturnType<typeof readOutcome>>;

async function readLink(tx: TransactionClient, outcome: StoredOutcome) {
  const entry = await tx.medicalEntry.findUnique({ where: { outcomeId: outcome.id } });
  if (!entry) return null;
  if (outcome.type !== "EUTHANIZED" && outcome.type !== "DECEASED") throw integrity();
  const kind = outcome.type === "EUTHANIZED" ? "EUTHANASIA" : "DEATH";
  if (entry.animalId !== outcome.animalId || entry.kind !== kind ||
      entry.status !== "COMPLETED" || !entry.completedDate || entry.itemId || entry.dueDate ||
      entry.procedure || entry.chipNumber || entry.examType || entry.notes ||
      entry.declineReason || entry.exemptionReason || entry.reviewDate ||
      entry.batchId || entry.protocolStepId || entry.vetReportId ||
      entry.reportedByFoster ||
      entry.administeredById) throw integrity();

  // Sibling relations are read sequentially: an interactive transaction has
  // one connection. An extra details table is an integrity error too.
  const euthanasia = await tx.euthanasiaDetails.findUnique({ where: { entryId: entry.id } });
  const death = await tx.deathDetails.findUnique({ where: { entryId: entry.id } });
  const where = { entryId: entry.id };
  for (const count of [
    () => tx.vaccineDetails.count({ where }), () => tx.testDetails.count({ where }),
    () => tx.treatmentDetails.count({ where }), () => tx.surgeryDetails.count({ where }),
    () => tx.microchipDetails.count({ where }), () => tx.examDetails.count({ where }),
  ]) {
    if (await count()) throw integrity();
  }
  let values: OutcomeMedicalValues;
  if (kind === "EUTHANASIA") {
    if (!euthanasia || death || !entry.source || entry.source === "BEFORE_INTAKE") throw integrity();
    values = { kind, source: entry.source, vetPartnerId: entry.vetPartnerId,
      vetName: entry.vetName, administeredById: null, ...euthanasiaData(euthanasia) };
  } else {
    if (!death || euthanasia || entry.source || entry.vetPartnerId || entry.vetName) throw integrity();
    values = { kind, source: null, vetPartnerId: null, vetName: null, administeredById: null, ...deathData(death) };
  }
  return { entry, values };
}

function parseMedical(outcome: StoredOutcome, medical: OutcomeMedicalDetailsInput | undefined, create: boolean) {
  const result = (create ? OutcomeMedicalCreateSchema : OutcomeMedicalCorrectionSchema)
    .safeParse({ outcomeType: outcome.type, medical });
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new MedicalEntryRefusal(issue.message, issue.path.join(".") || "medical");
  }
  return result.data.medical ? outcomeMedicalValues(result.data.medical) : undefined;
}

async function checkReferences(tx: TransactionClient, values: OutcomeMedicalValues, before?: OutcomeMedicalValues) {
  if (values.kind !== "EUTHANASIA") return;
  for (const field of ["authorizedById", "performedById"] as const) {
    const id = values[field];
    if (id && !await tx.person.findUnique({ where: { id }, select: { id: true } })) {
      throw new MedicalEntryRefusal("Pick a person from the directory.", `medical.${field}`);
    }
  }
  if (values.vetPartnerId && values.vetPartnerId !== before?.vetPartnerId) {
    await checkVetClinic(tx, values.vetPartnerId, "medical.vetPartnerId");
  }
}

const sharedData = (values: OutcomeMedicalValues) => ({
  source: values.source, vetPartnerId: values.vetPartnerId, vetName: values.vetName,
  administeredById: null,
});

type SharedField = "kind" | "source" | "vetPartnerId" | "vetName" | "administeredById";
function euthanasiaData(values: Omit<Extract<OutcomeMedicalValues, { kind: "EUTHANASIA" }>, SharedField>) {
  return {
    reasonCategory: values.reasonCategory, reasonNotes: values.reasonNotes,
    authorizedById: values.authorizedById, performedById: values.performedById,
    performedByName: values.performedByName, drug: values.drug, dose: values.dose,
    route: values.route, witness: values.witness, bodyDisposition: values.bodyDisposition,
  };
}
function deathData(values: Omit<Extract<OutcomeMedicalValues, { kind: "DEATH" }>, SharedField>) {
  return {
    circumstances: values.circumstances, circumstanceNotes: values.circumstanceNotes,
    cause: values.cause, necropsyRequested: values.necropsyRequested,
    bodyDisposition: values.bodyDisposition,
  };
}

const json = (value: object) => value as Prisma.InputJsonObject;
const subject = (outcome: StoredOutcome) => outcome.type === "EUTHANIZED" ? "Euthanasia" : "Death";

async function createLinked(tx: TransactionClient, outcome: StoredOutcome, values: OutcomeMedicalValues, actorId: string) {
  await checkReferences(tx, values);
  const entry = await tx.medicalEntry.create({
    data: {
      animalId: outcome.animalId, outcomeId: outcome.id, kind: values.kind,
      status: "COMPLETED", completedDate: outcome.outcomeDate, createdById: actorId,
      ...sharedData(values),
      ...(values.kind === "EUTHANASIA"
        ? { euthanasia: { create: euthanasiaData(values) } }
        : { death: { create: deathData(values) } }),
    },
    select: { id: true },
  });
  await tx.medicalEntryEvent.create({ data: {
    entryId: entry.id, actorId, action: "CREATED",
    after: json({ ...values, status: "COMPLETED", outcomeId: outcome.id, completedDate: outcome.outcomeDate }),
  } });
  await tx.animalActivityLog.create({ data: {
    animalId: outcome.animalId, changedById: actorId, activityType: "MEDICAL_ENTRY_RECORDED",
    changeSummary: `${subject(outcome)} medical details recorded for the outcome on ${outcome.outcomeDate}.`,
  } });
  return { status: "created" as const, entryId: entry.id, animalId: outcome.animalId };
}

/** Creates exactly one entry for an existing live outcome, never a retry duplicate. */
export async function recordOutcomeMedical(
  tx: TransactionClient, outcomeId: string, animalId: string,
  medical: OutcomeMedicalDetailsInput, actorId: string,
) {
  const outcome = await readClinicalOutcome(tx, outcomeId, animalId);
  if (outcome.reversedAt) throw new ConflictError("This outcome was reversed, so medical details cannot be recorded.");
  if (await readLink(tx, outcome)) throw new ConflictError("This outcome already has a medical record.");
  const values = parseMedical(outcome, medical, true)!;
  return createLinked(tx, outcome, values, actorId);
}

/**
 * Corrects current details, synchronizes the stored outcome day, or explicitly
 * attaches complete details to a legacy gap. Omission keeps the gap/details.
 * Call after updating the outcome day in this same transaction.
 */
export async function correctOutcomeMedical(
  tx: TransactionClient, outcomeId: string, animalId: string,
  medical: OutcomeMedicalDetailsInput | undefined, actorId: string,
) {
  const outcome = await readClinicalOutcome(tx, outcomeId, animalId);
  if (outcome.reversedAt) throw new ConflictError("This outcome was reversed, so it can no longer be corrected.");
  const stored = await readLink(tx, outcome);
  const values = parseMedical(outcome, medical, false);
  if (!stored) {
    return values ? createLinked(tx, outcome, values, actorId)
      : { status: "unchanged" as const, entryId: null, animalId };
  }
  if (stored.entry.voidedAt || stored.entry.voidedById || stored.entry.voidReason) throw integrity();
  const afterValues = values ?? stored.values;
  if (values) await checkReferences(tx, values, stored.values);
  const before = { ...stored.values, completedDate: stored.entry.completedDate };
  const after = { ...afterValues, completedDate: outcome.outcomeDate };
  const changed = Object.keys(after).filter((key) =>
    (before as Record<string, unknown>)[key] !== (after as Record<string, unknown>)[key]);
  if (!changed.length) return { status: "unchanged" as const, entryId: stored.entry.id, animalId };

  await tx.medicalEntry.update({ where: { id: stored.entry.id }, data: {
    ...sharedData(afterValues), completedDate: outcome.outcomeDate,
  } });
  if (values?.kind === "EUTHANASIA") {
    await tx.euthanasiaDetails.update({ where: { entryId: stored.entry.id },
      data: euthanasiaData(values) });
  } else if (values?.kind === "DEATH") {
    await tx.deathDetails.update({ where: { entryId: stored.entry.id },
      data: deathData(values) });
  }
  const pick = (value: object) => json(Object.fromEntries(changed.map((key) => [key, (value as Record<string, unknown>)[key]])));
  await tx.medicalEntryEvent.create({ data: {
    entryId: stored.entry.id, actorId, action: "EDITED", before: pick(before), after: pick(after),
  } });
  const changeSummary = `${subject(outcome)} medical record was corrected through its outcome.`;
  await tx.animalActivityLog.create({ data: {
    animalId, changedById: actorId, activityType: "MEDICAL_ENTRY_EDITED", changeSummary,
  } });
  return { status: "edited" as const, entryId: stored.entry.id, animalId, changeSummary };
}

/**
 * Call after marking the outcome reversed in this transaction, outside any
 * listing/housing restoration guard. The stored reversal supplies its actor,
 * reason and one instant to the entry, event and activity. A legacy gap writes
 * nothing. Documents and all other care remain untouched.
 */
export async function voidOutcomeMedical(tx: TransactionClient, outcomeId: string, animalId: string) {
  const outcome = await readOutcome(tx, outcomeId, animalId);
  const stored = await readLink(tx, outcome);
  if (!stored) return { entryId: null, animalId };
  const { reversedAt, reversedById, reversalReason } = outcome;
  if (!reversedAt || !reversedById || !reversalReason?.trim() ||
      reversalReason !== reversalReason.trim() || reversalReason.length > REVERSAL_REASON_MAX_LENGTH ||
      stored.entry.completedDate !== outcome.outcomeDate || stored.entry.voidedAt ||
      stored.entry.voidedById || stored.entry.voidReason) throw integrity();
  await tx.medicalEntry.update({ where: { id: stored.entry.id }, data: {
    voidedAt: reversedAt, voidedById: reversedById, voidReason: reversalReason,
  } });
  await tx.medicalEntryEvent.create({ data: {
    entryId: stored.entry.id, actorId: reversedById, action: "VOIDED", createdAt: reversedAt,
    after: { voidReason: reversalReason },
  } });
  await tx.animalActivityLog.create({ data: {
    animalId, changedById: reversedById, activityType: "MEDICAL_ENTRY_VOIDED", changedAt: reversedAt,
    changeSummary: `${subject(outcome)} medical record was voided with its outcome. Reason: ${reversalReason}`,
  } });
  return { entryId: stored.entry.id, animalId };
}
