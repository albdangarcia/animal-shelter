import type { TransactionClient } from "@/app/lib/prisma";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { findLiveUnitForPlacement } from "@/app/lib/services/unit-housing";
import {
  AnimalActivityType,
  AnimalListingStatus,
} from "@/prisma/generated/enums";
import {
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";
import { buildLocationChangeSummary } from "@/app/lib/utils/location-activity";

/**
 * The housing board's move: puts an animal in a unit, or takes it out to
 * Unplaced, by writing `Animal.currentUnitId`, and logs the change.
 *
 * Like `unit-housing`, this module has no `next/*` and no auth imports, so a
 * plain `node:test` can drive it. It runs inside the caller's
 * `prisma.$transaction`.
 */

/**
 * A move refused because the animal has left the shelter. Its own class so
 * the caller can refresh a board that still shows the animal, without
 * matching on the message.
 */
export class AnimalArchivedError extends PreconditionFailedError {
  constructor() {
    super("This animal has left the shelter, so it can't be placed in a unit.");
    this.name = "AnimalArchivedError";
  }
}

/**
 * Moves an animal to `targetUnitId`, or to Unplaced when it is null. Returns
 * the live target unit, or null for Unplaced.
 */
export const moveAnimal = async (
  tx: TransactionClient,
  animalId: string,
  targetUnitId: string | null,
  actorId: string,
) => {
  // Capture the animal's current placement before the move so the log can
  // read "from X to Y" rather than just "to Y". Read behind the animal's
  // lock: two moves of one animal at once would otherwise both read the
  // same starting unit, and the second would log a move from a unit the
  // animal had already left.
  await lockAnimal(tx, animalId);
  const currentAnimal = await tx.animal.findUnique({
    where: { id: animalId },
    select: {
      listingStatus: true,
      currentUnitId: true,
      currentUnit: {
        select: { name: true, location: { select: { name: true } } },
      },
    },
  });
  if (!currentAnimal) {
    throw new NotFoundError("That animal no longer exists.");
  }
  // An archived animal has left the shelter and cannot occupy a unit. A board
  // rendered before its outcome was recorded still shows it, so refuse rather
  // than report a move that did not happen. Recording an outcome takes the
  // same lock before it archives, so the two cannot interleave. Taking one
  // out to Unplaced only clears a unit it should not have, so that goes
  // through.
  if (
    currentAnimal.listingStatus === AnimalListingStatus.ARCHIVED &&
    targetUnitId !== null
  ) {
    throw new AnimalArchivedError();
  }
  const previousUnitId = currentAnimal.currentUnitId;
  const previousUnit = currentAnimal.currentUnit;

  // Guard against a stale board: the unit may have been soft-deleted
  // since the board was rendered, or be being deleted now. Read behind the
  // unit's lock, in the transaction that writes, so a delete either waits
  // for this move and sees the animal, or is seen by it.
  const target =
    targetUnitId === null
      ? null
      : await findLiveUnitForPlacement(tx, targetUnitId);
  if (targetUnitId !== null && !target) {
    throw new PreconditionFailedError("That unit is no longer available.");
  }
  const targetUnitIdResolved = target?.id ?? null;

  await tx.animal.update({
    where: { id: animalId },
    data: { currentUnitId: targetUnitIdResolved },
  });

  // Only log when the unit actually changed (e.g. skip a drop back onto
  // the same unit).
  if (previousUnitId !== targetUnitIdResolved && actorId) {
    await tx.animalActivityLog.create({
      data: {
        animalId,
        activityType: AnimalActivityType.LOCATION_CHANGE,
        changedById: actorId,
        changeSummary: buildLocationChangeSummary(
          previousUnit,
          target ? { name: target.name, location: target.location } : null,
        ),
      },
    });
  }

  return target;
};
