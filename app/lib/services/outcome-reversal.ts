import type { TransactionClient } from "@/app/lib/prisma";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  AnimalActivityType,
  AnimalListingStatus,
} from "@/prisma/generated/enums";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";

/**
 * Reversing an outcome that should never have been recorded, for when the
 * outcome was entered against the wrong animal, with the wrong type, or not
 * at all. It is not for an animal that left and came back: that really
 * happened, and is a re-intake.
 *
 * Before this, the only way to un-archive an animal was a re-intake, and using
 * one to undo a mistake records an intake that never happened. Intakes and
 * outcomes feed the reports directly, so both counts go up and one real stay
 * becomes two short ones.
 *
 * A reversal voids the row rather than deleting it or posting an opposite
 * entry. The outcome is kept, with who reversed it, when and why, and from
 * then on counts for nothing: an application's adopted or closed status is
 * derived from the animal's outcomes and stops following from this one, so
 * nothing written on the applications has to be undone. `reversedAt` is
 * written once and never cleared. A reversal made in error is answered by
 * recording the outcome again, which leaves this one on the record as voided.
 *
 * Like `person-account-unlink`, this module has **no `next/*` and no auth
 * imports**, so a plain `node:test` can drive it. It runs inside the caller's
 * `prisma.$transaction`.
 */

export interface OutcomeReversal {
  animalId: string;
  /** The application the outcome was linked to, when it was an adoption. */
  adoptionApplicationId: string | null;
  /** The listing status the animal was given back, or null when left alone. */
  restoredListingStatus: AnimalListingStatus | null;
  /** The foster placement put back to open, when the outcome closed one. */
  reopenedPlacementId: string | null;
  /** What happened to the listing and placement, as sentences for staff. */
  effects: string;
}

const describe = (value: string) => value.replace(/_/g, " ").toLowerCase();

export const recordOutcomeReversal = async (
  tx: TransactionClient,
  outcomeId: string,
  reason: string,
  actorId: string,
): Promise<OutcomeReversal> => {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new PreconditionFailedError(
      "A reason for reversing this outcome is required.",
    );
  }

  // An outcome's animal never changes, so this read needs no lock.
  const located = await tx.outcome.findUnique({
    where: { id: outcomeId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("Outcome not found.");
  }
  const { animalId } = located;

  // Taken before anything is read. It is the lock every write that depends on
  // an application's effective status takes, and this changes that status for
  // every application on the animal. It also serialises two reversals of the
  // same outcome, so the check below sees the other one's write.
  await lockAnimal(tx, animalId);

  const outcome = await tx.outcome.findUnique({
    where: { id: outcomeId },
    select: {
      type: true,
      reversedAt: true,
      previousListingStatus: true,
      adoptionApplicationId: true,
      fosterPlacement: {
        select: {
          id: true,
          fosterProfile: { select: { person: { select: { name: true } } } },
        },
      },
    },
  });
  if (!outcome) {
    throw new NotFoundError("Outcome not found.");
  }
  // Re-read behind the lock: two people could reverse the same outcome at
  // the same moment.
  if (outcome.reversedAt) {
    throw new ConflictError("This outcome has already been reversed.");
  }

  // Whether this outcome is what archived the animal, and so what the listing
  // status stored on it is a snapshot of. Only an outcome archives an animal
  // and only a re-intake or a reversal takes it back out, so that holds when
  // the animal is archived and this is the latest live outcome recorded for
  // it. Otherwise something has moved the animal since: a re-intake, and
  // perhaps a later outcome. The snapshot is stale then, and restoring it
  // would overwrite what happened after, so the listing is left alone.
  const animal = await tx.animal.findUnique({
    where: { id: animalId },
    select: { listingStatus: true },
  });
  const latestLive = await tx.outcome.findFirst({
    where: { animalId, reversedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  const archivedByThisOutcome =
    animal?.listingStatus === AnimalListingStatus.ARCHIVED &&
    latestLive?.id === outcomeId;

  // Guarded as well as checked above, so that nothing reaching this without
  // the lock can overwrite a reversal already recorded.
  const reversed = await tx.outcome.updateMany({
    where: { id: outcomeId, reversedAt: null },
    data: {
      reversedAt: new Date(),
      reversedById: actorId,
      reversalReason: trimmedReason,
    },
  });
  if (reversed.count === 0) {
    throw new ConflictError("This outcome has already been reversed.");
  }

  const effects: string[] = [];
  let restoredListingStatus: AnimalListingStatus | null = null;
  let reopenedPlacementId: string | null = null;

  if (archivedByThisOutcome) {
    // An outcome recorded before the before-value was kept has none. The
    // animal still has to come out of the archive, since nothing else would
    // take it out short of a re-intake, and a draft publishes nothing staff
    // have not chosen to publish. It is where a re-intake puts an animal too.
    restoredListingStatus =
      outcome.previousListingStatus ?? AnimalListingStatus.DRAFT;
    // archiveReason described the outcome that archived the animal, which
    // this one no longer is.
    await tx.animal.update({
      where: { id: animalId },
      data: { listingStatus: restoredListingStatus, archiveReason: null },
    });
    effects.push(
      outcome.previousListingStatus
        ? `The listing was restored to ${describe(restoredListingStatus)}.`
        : "The listing was set to draft, since nothing recorded what it was before this outcome.",
    );

    // A foster-to-adopt conversion closed its placement when it recorded this
    // outcome. With the adoption voided the placement never ended, so it is
    // open again: the animal is back with the foster, exactly as before the
    // conversion. The link to this outcome stays, as part of what the
    // placement recorded, until a conversion links another. The foster's
    // capacity is not rechecked, because the animal was never really gone.
    if (outcome.fosterPlacement) {
      reopenedPlacementId = outcome.fosterPlacement.id;
      await tx.fosterPlacement.update({
        where: { id: reopenedPlacementId },
        data: {
          endDate: null,
          returnReason: null,
          returnedById: null,
          adoptionApplicationId: null,
        },
      });
      effects.push(
        `The foster placement with ${outcome.fosterPlacement.fosterProfile.person.name} was reopened.`,
      );
    }
  } else {
    effects.push(
      "The listing was left as it is, since this outcome is no longer what archived the animal.",
    );
  }

  const effectsText = effects.join(" ");

  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.OUTCOME_REVERSED,
      changedById: actorId,
      changeSummary: `Outcome was reversed: ${describe(outcome.type)}. ${effectsText} Reason: ${trimmedReason}`,
    },
  });

  return {
    animalId,
    adoptionApplicationId: outcome.adoptionApplicationId,
    restoredListingStatus,
    reopenedPlacementId,
    effects: effectsText,
  };
};

/**
 * Refuses to link an application that already has a live adoption outcome.
 *
 * A reversed outcome keeps its link, so the database allows one application
 * several adoption outcomes over time, and at most one that is not reversed.
 * A partial unique index says so too. This check runs inside each transaction
 * that records an adoption, behind the animal lock, so a second one is refused
 * with a message rather than a constraint error.
 */
export const assertNoLiveAdoptionOutcome = async (
  tx: TransactionClient,
  adoptionApplicationId: string,
): Promise<void> => {
  const live = await tx.outcome.findFirst({
    where: { adoptionApplicationId, reversedAt: null },
    select: { id: true },
  });
  if (live) {
    throw new ConflictError(
      "This application already has an adoption recorded against it.",
    );
  }
};
