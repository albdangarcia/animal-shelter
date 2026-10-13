import type { TransactionClient } from "@/app/lib/prisma";
import { AnimalActivityType } from "@/prisma/generated/enums";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { PreconditionFailedError } from "@/app/lib/utils/errors";
import { stampedAfter } from "@/app/lib/utils/activity-stamp";
import { LATEST_ENTRY_ORDER } from "@/app/lib/utils/vitals-order";
import { formatWeight } from "@/app/lib/utils/weight-format";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import {
  NO_MEASUREMENT_MESSAGE,
  VitalsMeasurementsSchema,
  hasVitalsMeasurement,
  type VitalsMeasurements,
} from "@/app/lib/zod-schemas/vitals.schemas";

/**
 * Recording an animal's vitals, and the weight they leave it with.
 *
 * `Animal.currentWeightGrams` is a cache of the animal's latest weigh-in, and
 * `recomputeCurrentWeight` is its only writer, apart from a new animal's first
 * weigh-in at intake, which can't have another entry to compete with. It is
 * the `weightGrams` of the most recent non-deleted entry with a weight,
 * ordered by `recordedAt`, not `createdAt`: a backdated entry must not win
 * just because it was entered last. Every write that adds, changes, deletes or
 * restores a vitals entry calls it, in the same transaction, after the write.
 * It takes the animal's lock before it reads, as every write to the animal's
 * medical record does: a weigh-in another transaction (an exam, say) is still
 * writing can't be read past, so the cache is never set from a stale latest
 * weigh-in once that one commits.
 *
 * The Vitals page and an exam that measures vitals both record through
 * `recordVitals`, so the two write the same entry and the same activity text.
 * Like the other services, this module has no `next/*` and no auth imports,
 * so database tests can drive it. It runs inside the caller's transaction.
 */

/** Vitals refused by the measurement rules, on the field that broke one. */
export class VitalsRefusal extends PreconditionFailedError {
  readonly field: keyof VitalsMeasurements;

  constructor(message: string, field: keyof VitalsMeasurements) {
    super(message);
    this.name = "VitalsRefusal";
    this.field = field;
  }
}

/** The three measurements, any of which may be missing. */
export type VitalsMeasurementsInput = Partial<
  Record<keyof VitalsMeasurements, number | null>
>;

/**
 * The first measurement rule the values break, or null: at least one
 * measurement, each within the bounds the Vitals page's form applies.
 */
export const vitalsMeasurementIssue = (
  measurements: VitalsMeasurementsInput,
): { field: keyof VitalsMeasurements; message: string } | null => {
  const parsed = VitalsMeasurementsSchema.safeParse({
    weightGrams: measurements.weightGrams ?? null,
    temperatureC: measurements.temperatureC ?? null,
    bodyConditionScore: measurements.bodyConditionScore ?? null,
  });
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    return {
      field: issue.path[0] as keyof VitalsMeasurements,
      message: issue.message,
    };
  }
  if (!hasVitalsMeasurement(measurements)) {
    return { field: "weightGrams", message: NO_MEASUREMENT_MESSAGE };
  }
  return null;
};

export interface RecordVitalsInput extends VitalsMeasurementsInput {
  animalId: string;
  recordedAt: Date;
  notes?: string | null;
}

/**
 * Recomputes the animal's current weight from its vitals entries, and returns
 * it. See the header for when to call it.
 */
export const recomputeCurrentWeight = async (
  tx: TransactionClient,
  animalId: string,
): Promise<number | null> => {
  await lockAnimal(tx, animalId);
  const latestWeighIn = await tx.vitalsLog.findFirst({
    where: { animalId, deletedAt: null, weightGrams: { not: null } },
    orderBy: LATEST_ENTRY_ORDER,
    select: { weightGrams: true },
  });

  const currentWeightGrams = latestWeighIn?.weightGrams ?? null;
  await tx.animal.update({
    where: { id: animalId },
    data: { currentWeightGrams },
  });
  return currentWeightGrams;
};

/**
 * Writes a vitals entry, recomputes the animal's current weight, and logs it:
 * "Weight recorded: 12.4 kg (up 0.2 kg)", or "Vitals recorded." when no
 * weight was taken. The change is against the weigh-in recorded just before
 * this one, so a backdated entry is compared with what came before it, not
 * with a later one. Its activity row is stamped after `loggedAfter` when
 * given. Refused, with nothing written, when no measurement was taken or one
 * is out of bounds.
 */
export async function recordVitals(
  tx: TransactionClient,
  input: RecordVitalsInput,
  actorId: string,
  {
    unitSystem,
    loggedAfter,
  }: { unitSystem: WeightUnitSystem; loggedAfter?: Date | null },
): Promise<{ vitalsLogId: string; loggedAt: Date }> {
  const issue = vitalsMeasurementIssue(input);
  if (issue) {
    throw new VitalsRefusal(issue.message, issue.field);
  }
  const { animalId, recordedAt } = input;
  const weightGrams = input.weightGrams ?? null;
  // Behind the animal's lock, so the weigh-in before this one is read as
  // committed by anyone writing the animal's record at the same moment.
  await lockAnimal(tx, animalId);

  // Read before the insert, and bounded to entries recorded before this one,
  // so the text names the change since the weigh-in chronologically before
  // it. A display convenience only: the cached weight is recomputed below.
  const previousWeighIn = await tx.vitalsLog.findFirst({
    where: {
      animalId,
      deletedAt: null,
      weightGrams: { not: null },
      recordedAt: { lt: recordedAt },
    },
    orderBy: LATEST_ENTRY_ORDER,
    select: { weightGrams: true },
  });

  const log = await tx.vitalsLog.create({
    data: {
      animalId,
      recordedById: actorId,
      recordedAt,
      weightGrams,
      temperatureC: input.temperatureC ?? null,
      bodyConditionScore: input.bodyConditionScore ?? null,
      notes: input.notes || null,
    },
    select: { id: true },
  });

  await recomputeCurrentWeight(tx, animalId);

  let changeSummary = "Vitals recorded.";
  if (weightGrams != null) {
    changeSummary = `Weight recorded: ${formatWeight(weightGrams, unitSystem)}`;
    if (previousWeighIn?.weightGrams != null) {
      const delta = weightGrams - previousWeighIn.weightGrams;
      if (delta !== 0) {
        changeSummary += ` (${delta > 0 ? "up" : "down"} ${formatWeight(
          Math.abs(delta),
          unitSystem,
        )})`;
      }
    }
  }

  const { changedAt: loggedAt } = await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.VITALS_RECORDED,
      changedById: actorId,
      changeSummary,
      changedAt: stampedAfter(loggedAfter),
    },
    select: { changedAt: true },
  });

  return { vitalsLogId: log.id, loggedAt };
}
