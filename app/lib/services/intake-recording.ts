import type { TransactionClient } from "@/app/lib/prisma";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { checkTimelineChange } from "@/app/lib/data/animal-timeline.data";
import {
  AnimalActivityType,
  AnimalListingStatus,
  IntakeType,
} from "@/prisma/generated/enums";
import { ConflictError, TimelineOrderError } from "@/app/lib/utils/errors";
import type { ReIntakeFormOutput } from "@/app/lib/zod-schemas/intake.schema";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import {
  applyIntakeProtocol,
  type AppliedProtocol,
} from "@/app/lib/services/medical-protocol-application";

/**
 * Re-intaking an animal that has left: a new stay, opened with an intake on
 * the day it came back. The day goes through `checkTimelineChange` behind the
 * animal's lock, and a day it refuses is thrown as a `TimelineOrderError` to
 * roll the transaction back.
 *
 * Like `outcome-recording`, this module has no `next/*` and no auth imports,
 * so a plain `node:test` can drive it. It runs inside the caller's
 * `prisma.$transaction`.
 */

const NOT_ARCHIVED_MESSAGE =
  "Cannot process re-intake: This animal is not currently archived or was just re-intaked.";

export interface ReIntakeToRecord {
  animalId: string;
  values: ReIntakeFormOutput;
}

// "" -> null for the nullable columns Intake.create writes. The form submits
// an untouched optional field as "" rather than leaving it out, and an empty
// string must not be written into a nullable column.
const toReIntakeData = (data: ReIntakeFormOutput) => ({
  notes: data.notes || null,
  sourcePartnerId: data.sourcePartnerId || null,
  foundAddress: data.foundAddress || null,
  foundCity: data.foundCity || null,
  foundState: data.foundState || null,
  surrenderingPersonId: data.surrenderingPersonId || null,
});

/**
 * Lists the animal again as a draft, and records the intake that brought it
 * back, with its activity row. Then the medical protocol for its species and
 * its age on that day schedules its care again, unless `applyProtocol` is
 * off (the caller checks that the actor may skip it): a returning animal
 * needs its boosters again. Care still open from its last stay counts as
 * already scheduled.
 */
export const recordReIntake = async (
  tx: TransactionClient,
  { animalId, values }: ReIntakeToRecord,
  actorId: string,
): Promise<{ protocol: AppliedProtocol | null }> => {
  const { intakeDate, intakeType } = values;
  const mapped = toReIntakeData(values);

  // Held until commit, so the animal's intakes and outcomes are still as the
  // check below reads them when the intake is written. Recording, correcting
  // and reversing an outcome all hold this row while they write, and an
  // outcome day moved past this intake's in between would otherwise leave
  // two intakes in a row. No person lock is held here, so this keeps the
  // order `lockAnimal` documents.
  await lockAnimal(tx, animalId);
  const animal = await tx.animal.findUnique({
    where: { id: animalId },
    select: { listingStatus: true },
  });

  // Refused on status before the day is checked. An animal in care has a
  // timeline that already ends on an intake, so the check would refuse this
  // one too, but with a message about dates rather than the actual reason.
  if (!animal || animal.listingStatus !== AnimalListingStatus.ARCHIVED) {
    throw new ConflictError(NOT_ARCHIVED_MESSAGE);
  }

  const refusal = await checkTimelineChange(tx, animalId, {
    kind: "addIntake",
    day: intakeDate,
  });
  if (refusal) {
    throw new TimelineOrderError(refusal, "intakeDate");
  }

  // Guarded as well as checked above, so that nothing reaching this without
  // the lock can re-intake the animal twice.
  const updateResult = await tx.animal.updateMany({
    where: {
      id: animalId,
      listingStatus: AnimalListingStatus.ARCHIVED,
    },
    data: {
      listingStatus: AnimalListingStatus.DRAFT,
      archiveReason: null,
    },
  });

  if (updateResult.count === 0) {
    throw new ConflictError(NOT_ARCHIVED_MESSAGE);
  }

  // Create a new Intake record for this event
  await tx.intake.create({
    data: {
      intakeDate,
      type: intakeType,
      notes: mapped.notes,
      animalId,
      staffMemberId: actorId,
      sourcePartnerId:
        intakeType === IntakeType.TRANSFER_IN
          ? mapped.sourcePartnerId
          : undefined,
      surrenderingPersonId:
        intakeType === IntakeType.OWNER_SURRENDER
          ? mapped.surrenderingPersonId
          : undefined,
      foundAddress:
        intakeType === IntakeType.STRAY ? mapped.foundAddress : undefined,
      foundCity: intakeType === IntakeType.STRAY ? mapped.foundCity : undefined,
      foundState:
        intakeType === IntakeType.STRAY ? mapped.foundState : undefined,
    },
  });

  // Log this important event in the animal's history
  const intakeRow = await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.INTAKE_PROCESSED,
      changedById: actorId,
      changeSummary: `Animal was re-intaked as ${intakeType
        .replace(/_/g, " ")
        .toLowerCase()}.`,
    },
    select: { changedAt: true },
  });

  if (!values.applyProtocol) return { protocol: null };
  const protocol = await applyIntakeProtocol(
    tx,
    { animalId, intakeDate },
    actorId,
    await getShelterToday(),
    { loggedAfter: intakeRow.changedAt },
  );
  return { protocol };
};
