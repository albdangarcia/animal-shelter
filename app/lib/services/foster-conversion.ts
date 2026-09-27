import type { TransactionClient } from "@/app/lib/prisma";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { checkTimelineChange } from "@/app/lib/data/animal-timeline.data";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatus,
  lockAnimal,
} from "@/app/lib/data/application-status.data";
import { assertNoLiveAdoptionOutcome } from "@/app/lib/services/outcome-reversal";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationStatus,
  FosterPlacementType,
  FosterReturnReason,
  OutcomeType,
} from "@/prisma/generated/enums";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  TimelineOrderError,
} from "@/app/lib/utils/errors";

/**
 * Converting a foster-to-adopt placement to an adoption by the foster.
 *
 * Like `outcome-reversal`, this module has no `next/*` and no auth imports, so
 * a plain `node:test` can drive it. It runs inside the caller's
 * `prisma.$transaction`.
 *
 * The conversion records an adoption outcome dated today, archives the animal
 * for it, and closes the placement as adopted by the foster, linked to the
 * outcome and to the foster's application when one is given.
 */

export type FosterConversionValues = {
  placementId: string;
  adoptionApplicationId?: string;
};

export const recordFosterConversion = async (
  tx: TransactionClient,
  values: FosterConversionValues,
  staffMemberId: string,
): Promise<{ animalId: string }> => {
  const { placementId, adoptionApplicationId } = values;

  const placement = await tx.fosterPlacement.findUnique({
    where: { id: placementId },
    select: {
      endDate: true,
      type: true,
      animalId: true,
      fosterProfile: {
        select: { person: { select: { id: true, name: true } } },
      },
    },
  });

  if (!placement) {
    throw new NotFoundError("Foster placement not found.");
  }
  if (placement.endDate !== null) {
    throw new ConflictError("This foster placement has already ended.");
  }
  if (placement.type !== FosterPlacementType.FOSTER_TO_ADOPT) {
    throw new PreconditionFailedError(
      "Only foster-to-adopt placements can be converted here. Use the standard outcome flow to process an adoption for other placement types.",
    );
  }

  // Same ordering as `recordOutcome` in outcome-recording: lock the
  // animal and read the listing status the outcome stores for a reversal
  // to restore, archive the animal (guarded, mirroring its "already
  // processed" check), check the day against the animal's timeline, then
  // validate the optional application, then create the outcome. The
  // archive comes before the day, as the status check does there, so an
  // archived animal is refused for that and not for a date.
  await lockAnimal(tx, placement.animalId);
  const animal = await tx.animal.findUnique({
    where: { id: placement.animalId },
    select: { listingStatus: true },
  });
  const archiveResult = await tx.animal.updateMany({
    where: {
      id: placement.animalId,
      listingStatus: { not: AnimalListingStatus.ARCHIVED },
    },
    data: {
      listingStatus: AnimalListingStatus.ARCHIVED,
      archiveReason: OutcomeType.ADOPTION,
    },
  });
  if (!animal || archiveResult.count === 0) {
    throw new ConflictError(
      "This animal has already been processed for an outcome.",
    );
  }

  // The conversion happens now, so the adoption is dated today on the
  // shelter's calendar. Nothing in the placement records the day the
  // foster decided, and inventing one from its dates would be a guess.
  //
  // Today can only be refused when the stay's intake is dated in the
  // future. It is checked anyway, like every other outcome day, so no
  // writer of one has to be remembered as the exception.
  const outcomeDate = await getShelterToday();
  const refusal = await checkTimelineChange(tx, placement.animalId, {
    kind: "addOutcome",
    day: outcomeDate,
  });
  if (refusal) {
    throw new TimelineOrderError(refusal, "outcomeDate");
  }

  if (adoptionApplicationId) {
    const application = await tx.adoptionApplication.findUnique({
      where: { id: adoptionApplicationId },
      select: { ...DERIVATION_APPLICATION_SELECT, applicantId: true },
    });
    if (!application || application.animalId !== placement.animalId) {
      throw new PreconditionFailedError(
        "That adoption application does not belong to this animal.",
      );
    }
    // This is the foster's own conversion, so the application has to be
    // theirs — nothing else names an adopter for this outcome, the way a
    // standard adoption outcome's adopter is always its linked
    // application's applicant. Without this, any approved application for
    // the animal (another applicant's) could be linked here and credited
    // to the wrong person.
    if (application.applicantId !== placement.fosterProfile.person.id) {
      throw new PreconditionFailedError(
        "That adoption application does not belong to this foster.",
      );
    }
    await assertNoLiveAdoptionOutcome(tx, application.id);
    // Effective, not the column, for the same reason as `recordOutcome`:
    // an application an earlier stay's outcome adopted or closed still
    // stores APPROVED.
    if (
      (await effectiveApplicationStatus(application, tx)) !==
      ApplicationStatus.APPROVED
    ) {
      throw new PreconditionFailedError(
        "Cannot convert: the linked adoption application has not been approved.",
      );
    }
  }

  const outcome = await tx.outcome.create({
    data: {
      type: OutcomeType.ADOPTION,
      outcomeDate,
      previousListingStatus: animal.listingStatus,
      animal: { connect: { id: placement.animalId } },
      staffMember: { connect: { id: staffMemberId } },
      ...(adoptionApplicationId && {
        adoptionApplication: { connect: { id: adoptionApplicationId } },
      }),
    },
  });

  const outcomeRow = await tx.animalActivityLog.create({
    data: {
      animalId: placement.animalId,
      activityType: AnimalActivityType.OUTCOME_PROCESSED,
      changedById: staffMemberId,
      changeSummary: "Animal was processed for outcome: adoption.",
    },
    select: { changedAt: true },
  });

  // Nothing is written onto the applications, the same as any other
  // adoption outcome: the linked one now reads as adopted and every other
  // application still open on the animal as closed, both derived from
  // this outcome. None of them was rejected; nobody assessed them.

  // Guarded close, same compare-and-swap rationale as `recordFosterReturn`.
  const updateResult = await tx.fosterPlacement.updateMany({
    where: { id: placementId, endDate: null },
    data: {
      endDate: await getShelterToday(),
      returnReason: FosterReturnReason.ADOPTED_BY_FOSTER,
      returnedById: staffMemberId,
      outcomeId: outcome.id,
      ...(adoptionApplicationId && { adoptionApplicationId }),
    },
  });
  if (updateResult.count === 0) {
    throw new ConflictError("This foster placement has already ended.");
  }

  // Stamped at least a millisecond after the outcome's row, as
  // `recordOutcome` stamps its own, so the feed, which orders by time
  // alone, always shows the conversion above the adoption it recorded.
  await tx.animalActivityLog.create({
    data: {
      animalId: placement.animalId,
      activityType: AnimalActivityType.FOSTER_RETURNED,
      changedById: staffMemberId,
      changeSummary: `Foster-to-adopt placement with ${placement.fosterProfile.person.name} converted to an adoption.`,
      changedAt: new Date(
        Math.max(Date.now(), outcomeRow.changedAt.getTime() + 1),
      ),
    },
  });

  return { animalId: placement.animalId };
};
