import type { TransactionClient } from "@/app/lib/prisma";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { findLiveUnitForPlacement } from "@/app/lib/services/unit-housing";
import {
  AnimalActivityType,
  AnimalListingStatus,
  FosterPlacementType,
  type FosterReturnReason,
} from "@/prisma/generated/enums";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";

/**
 * Bringing an animal back from a foster placement.
 *
 * Like `outcome-reversal`, this module has no `next/*` and no auth imports, so
 * a plain `node:test` can drive it. It runs inside the caller's
 * `prisma.$transaction`.
 *
 * A return puts the animal in a unit, and for a foster-to-adopt placement
 * writes back the listing the placement saved. Both are only right for an
 * animal that is still in the shelter's care. An outcome recorded while the
 * placement was open archives the animal and leaves the placement open, so
 * returning it then would list an animal that has left as here (the saved
 * listing is never `ARCHIVED`) and house it in a unit. It is refused, and the
 * check reads the listing behind the animal's lock, so an outcome recorded at
 * the same moment either lands first and is seen here, or waits for this.
 */

export type FosterReturnValues = {
  placementId: string;
  returnReason: FosterReturnReason;
  returnNotes?: string;
  unitId: string;
};

export const recordFosterReturn = async (
  tx: TransactionClient,
  values: FosterReturnValues,
  staffMemberId: string,
): Promise<{ animalId: string }> => {
  const { placementId, returnReason, returnNotes, unitId } = values;

  const placement = await tx.fosterPlacement.findUnique({
    where: { id: placementId },
    select: {
      endDate: true,
      type: true,
      previousListingStatus: true,
      animalId: true,
      fosterProfile: { select: { person: { select: { name: true } } } },
    },
  });

  if (!placement) {
    throw new NotFoundError("Foster placement not found.");
  }
  if (placement.endDate !== null) {
    throw new ConflictError("This foster placement has already ended.");
  }

  // Taken before the placement is written, in the order a conversion of
  // this placement takes them: the conversion holds the animal and then
  // closes the placement, so closing it here first and then writing the
  // animal could leave each waiting for the other. A placement's animal
  // never changes, so the read above needs no lock.
  await lockAnimal(tx, placement.animalId);

  const animal = await tx.animal.findUnique({
    where: { id: placement.animalId },
    select: { listingStatus: true },
  });
  if (!animal || animal.listingStatus === AnimalListingStatus.ARCHIVED) {
    throw new PreconditionFailedError(
      "This animal has already left the shelter, so it can't be returned from foster.",
    );
  }

  // Read behind the unit's lock, so a delete of it at the same moment
  // either sees the animal come back or is seen here.
  const unit = await findLiveUnitForPlacement(tx, unitId);
  if (!unit) {
    throw new PreconditionFailedError(
      "That unit is no longer available. Please choose a different unit.",
    );
  }

  // Guarded update: the compare-and-swap on endDate is what makes this
  // race-safe against a concurrent return/conversion of the same
  // placement, without needing Serializable isolation.
  const updateResult = await tx.fosterPlacement.updateMany({
    where: { id: placementId, endDate: null },
    data: {
      endDate: await getShelterToday(),
      returnReason,
      // Nullable column: a cleared textarea submits "" from the client,
      // which should read back as "no notes" rather than an empty string.
      returnNotes: returnNotes?.trim() ? returnNotes : null,
      returnedById: staffMemberId,
    },
  });
  if (updateResult.count === 0) {
    throw new ConflictError("This foster placement has already ended.");
  }

  await tx.animal.update({
    where: { id: placement.animalId },
    data: {
      currentUnitId: unitId,
      ...(placement.type === FosterPlacementType.FOSTER_TO_ADOPT &&
        placement.previousListingStatus && {
          listingStatus: placement.previousListingStatus,
        }),
    },
  });

  await tx.animalActivityLog.create({
    data: {
      animalId: placement.animalId,
      activityType: AnimalActivityType.FOSTER_RETURNED,
      changedById: staffMemberId,
      changeSummary: `Returned from foster ${placement.fosterProfile.person.name}.${
        returnNotes ? ` ${returnNotes}` : ""
      }`,
    },
  });

  return { animalId: placement.animalId };
};
