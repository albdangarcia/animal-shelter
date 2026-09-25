import prisma, { type TransactionClient } from "@/app/lib/prisma";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatus,
  lockAnimal,
} from "@/app/lib/data/application-status.data";
import { checkTimelineChange } from "@/app/lib/data/animal-timeline.data";
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
import {
  calendarDay,
  formatShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import type { OutcomeFormOutput } from "@/app/lib/zod-schemas/outcome.schema";

/**
 * Recording an outcome from the outcome form, and correcting one already
 * recorded. Both put a day on the animal's timeline, so both pass it through
 * `checkTimelineChange` behind the animal's lock, and throw a
 * `TimelineOrderError` to roll back a day it refuses.
 *
 * An animal can leave while it is in foster: it dies there, is transferred out
 * from the foster home, or is adopted by someone. Recording the outcome ends
 * the open placement on the outcome's day, and links the placement to the
 * outcome, so a correction of the day moves the placement's end with it and a
 * reversal reopens it. The placement's start bounds the day in both.
 *
 * Like `outcome-reversal`, this module has no `next/*` and no auth imports, so
 * a plain `node:test` can drive it. `recordOutcome` runs inside the caller's
 * `prisma.$transaction`; `recordOutcomeCorrection` reads the outcome first and
 * opens its own.
 */

export interface OutcomeToRecord {
  animalId: string;
  adoptionApplicationId?: string;
  values: OutcomeFormOutput;
}

export interface RecordedOutcome {
  /**
   * The person whose foster placement the outcome ended, or whose placement's
   * end a correction moved, so the caller can refresh their foster profile.
   * Null when no placement was touched.
   */
  fosterPersonId: string | null;
}

const describe = (value: string) => value.replace(/_/g, " ").toLowerCase();

// A placement is part of the animal's time in the shelter's care, so the
// outcome that ends it cannot come before it began. The start day itself is
// allowed: the animal went out and left the same day.
const placementStartRefusal = (fosterName: string, startDate: string) =>
  `The outcome date can't be before the foster placement with ${fosterName} began on ${formatShelterDay(calendarDay(startDate))}.`;

/**
 * Archives the animal and records the outcome that archived it, with its
 * activity row. An open foster placement is ended by it, with a row of its own.
 */
export const recordOutcome = async (
  tx: TransactionClient,
  { animalId, adoptionApplicationId, values }: OutcomeToRecord,
  actorId: string,
): Promise<RecordedOutcome> => {
  const { outcomeDate, outcomeType, destinationPartnerId, ownerId, notes } =
    values;

  // Held until commit, so the listing status and unit read here are still the
  // animal's when the update below archives it and clears the unit. Both are
  // stored on the outcome, and are what a reversal of the outcome restores.
  // The lock also keeps the animal's other intakes and outcomes as the
  // timeline check below reads them.
  await lockAnimal(tx, animalId);
  const animal = await tx.animal.findUnique({
    where: { id: animalId },
    select: { listingStatus: true, currentUnitId: true },
  });

  // Refused on status before the day is checked. An archived animal's
  // timeline already ends on an outcome, so the check would refuse this one
  // too, but with a message about dates rather than the actual reason.
  if (!animal || animal.listingStatus === AnimalListingStatus.ARCHIVED) {
    throw new ConflictError(
      "This animal has already been processed for an outcome.",
    );
  }

  const refusal = await checkTimelineChange(tx, animalId, {
    kind: "addOutcome",
    day: outcomeDate,
  });
  if (refusal) {
    throw new TimelineOrderError(refusal, "outcomeDate");
  }

  // Read behind the lock. Starting a placement writes the animal row, so one
  // committed before the lock was taken is seen here, and one that has not
  // yet written it waits for this transaction, then fails its serializable
  // check against the archive below.
  const openPlacement = await tx.fosterPlacement.findFirst({
    where: { animalId, endDate: null },
    select: {
      id: true,
      type: true,
      startDate: true,
      fosterProfile: {
        select: { person: { select: { id: true, name: true } } },
      },
    },
  });
  const foster = openPlacement?.fosterProfile.person;
  // Only a backdated outcome can land here, since a placement always starts
  // on the day it is made.
  if (openPlacement && foster && outcomeDate < openPlacement.startDate) {
    throw new TimelineOrderError(
      placementStartRefusal(foster.name, openPlacement.startDate),
      "outcomeDate",
    );
  }

  // Guarded as well as checked above, so that nothing reaching this without
  // the lock can archive the animal twice.
  const updateResult = await tx.animal.updateMany({
    where: {
      id: animalId,
      listingStatus: { not: AnimalListingStatus.ARCHIVED },
    },
    data: {
      listingStatus: AnimalListingStatus.ARCHIVED,
      archiveReason: outcomeType,
      // An animal that has left the shelter is not in a kennel. Without
      // this, an adopted/transferred/deceased animal keeps occupying its
      // unit indefinitely. The vacated unit is kept on the outcome below.
      // OUTCOME_PROCESSED is already logged below and covers the
      // relocation, so no LOCATION_CHANGE is written for it.
      currentUnitId: null,
    },
  });
  if (updateResult.count === 0) {
    throw new ConflictError(
      "This animal has already been processed for an outcome.",
    );
  }

  // An application's adopted status is derived from an adoption outcome for
  // its own animal that links to it. A link on any other outcome, or from
  // another animal's outcome, would mark the application adopted here while
  // its animal's record says otherwise. The form never sends either; a direct
  // call must not be able to.
  if (adoptionApplicationId && outcomeType !== OutcomeType.ADOPTION) {
    throw new PreconditionFailedError(
      "Only an adoption outcome can be recorded against an adoption application.",
    );
  }

  // An adoption's adopter is always its application's applicant.
  let adopterId: string | null = null;

  // If the outcome is an ADOPTION, ensure it was published
  if (outcomeType === OutcomeType.ADOPTION) {
    if (!adoptionApplicationId) {
      throw new PreconditionFailedError(
        "An adoption application ID is required for adoption outcomes.",
      );
    }

    const application = await tx.adoptionApplication.findUnique({
      where: { id: adoptionApplicationId },
      select: { ...DERIVATION_APPLICATION_SELECT, applicantId: true },
    });

    if (application && application.animalId !== animalId) {
      throw new PreconditionFailedError(
        "Cannot process adoption: The application is for a different animal.",
      );
    }
    if (application) {
      await assertNoLiveAdoptionOutcome(tx, application.id);
    }
    // Approved as the application effectively is, not as the column says:
    // one approved during an earlier stay, and adopted or closed by that
    // stay's outcome, still stores APPROVED. Archiving the animal above holds
    // the lock every application status change takes, so this cannot move
    // before the outcome is written.
    if (
      !application ||
      (await effectiveApplicationStatus(application, tx)) !==
        ApplicationStatus.APPROVED
    ) {
      throw new PreconditionFailedError(
        "Cannot process adoption: The application has not been approved.",
      );
    }
    adopterId = application.applicantId;
  }

  // The foster adopting the animal they are fostering. From a foster-to-adopt
  // placement that is the conversion's job: it links the application to the
  // placement, which this form does not. Any other placement has no
  // conversion, so it ends here, as adopted by the foster.
  const adoptedByFoster = !!foster && adopterId === foster.id;
  if (
    adoptedByFoster &&
    openPlacement?.type === FosterPlacementType.FOSTER_TO_ADOPT
  ) {
    throw new PreconditionFailedError(
      `${foster.name} is adopting this animal from their foster-to-adopt placement. Convert the placement to an adoption from the animal's page instead.`,
    );
  }

  // Create the Outcome record
  const outcome = await tx.outcome.create({
    data: {
      outcomeDate,
      type: outcomeType,
      // `notes` now arrives as "" from a cleared textarea rather than
      // undefined, so it has to be mapped to null for the nullable column.
      notes: notes || null,
      previousListingStatus: animal.listingStatus,
      animal: { connect: { id: animalId } },
      staffMember: { connect: { id: actorId } },
      // Conditionally connect relationships
      ...(adoptionApplicationId && {
        adoptionApplication: { connect: { id: adoptionApplicationId } },
      }),
      ...(destinationPartnerId && {
        destinationPartner: { connect: { id: destinationPartnerId } },
      }),
      // Only a return to owner has an owner: the form keeps the field's
      // value while another type is chosen, so it can arrive with any type.
      ...(ownerId &&
        outcomeType === OutcomeType.RETURN_TO_OWNER && {
          owner: { connect: { id: ownerId } },
        }),
      ...(animal.currentUnitId && {
        previousUnit: { connect: { id: animal.currentUnitId } },
      }),
    },
    select: { id: true },
  });

  // Log this closing event in the animal's history, mirroring the
  // INTAKE_PROCESSED log written on every intake — without this, the
  // activity feed shows consecutive intakes with no outcome between them.
  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.OUTCOME_PROCESSED,
      changedById: actorId,
      changeSummary: `Animal was processed for outcome: ${outcomeType
        .replace(/_/g, " ")
        .toLowerCase()}.`,
    },
  });

  if (openPlacement && foster) {
    // Guarded like a return and a conversion, which take the same lock
    // before closing a placement, so a lost swap here means something
    // reached the placement without it.
    const closed = await tx.fosterPlacement.updateMany({
      where: { id: openPlacement.id, endDate: null },
      data: {
        endDate: outcomeDate,
        returnReason: adoptedByFoster
          ? FosterReturnReason.ADOPTED_BY_FOSTER
          : FosterReturnReason.ENDED_BY_OUTCOME,
        returnedById: actorId,
        outcomeId: outcome.id,
      },
    });
    if (closed.count === 0) {
      throw new ConflictError(
        "This animal's foster placement changed while the outcome was being recorded. Please try again.",
      );
    }

    // The activity type a return writes, as the conversion writes it too:
    // this is where the animal's time with the foster ends. The summary says
    // how, since nothing came back to the shelter.
    await tx.animalActivityLog.create({
      data: {
        animalId,
        activityType: AnimalActivityType.FOSTER_RETURNED,
        changedById: actorId,
        changeSummary: `Foster placement with ${foster.name} ended: ${
          adoptedByFoster ? "adopted by the foster" : describe(outcomeType)
        }.`,
      },
    });
  }

  // Nothing is written onto the applications. The one this outcome links to
  // now reads as adopted, and every other application still open on the
  // animal reads as closed, because both are derived from this outcome
  // (`deriveApplicationStatus`).

  return { fosterPersonId: foster?.id ?? null };
};

interface OutcomeCorrectionFields {
  outcomeDate: CalendarDay;
  notes: string | null;
  destinationPartnerId: string | null;
  ownerId: string | null;
}

// Names the fields that differ between the stored outcome and the submitted
// one, in the register of the other activity summaries. Returns null when
// nothing differs, so the caller can skip the write and the log row together.
// Partner and owner ids are resolved to names; the notes themselves are not
// echoed, since they can be long and the outcome record already holds them.
// A foster placement the outcome ended moves with the day, in the same row.
const describeOutcomeCorrection = async (
  before: OutcomeCorrectionFields,
  after: OutcomeCorrectionFields,
  endedPlacement: boolean,
): Promise<string | null> => {
  const changes: string[] = [];

  if (before.outcomeDate !== after.outcomeDate) {
    changes.push(
      `the date changed from ${formatShelterDay(before.outcomeDate)} to ${formatShelterDay(after.outcomeDate)}`,
    );
    if (endedPlacement) {
      changes.push("the foster placement's end moved with it");
    }
  }

  if (before.destinationPartnerId !== after.destinationPartnerId) {
    const ids = [before.destinationPartnerId, after.destinationPartnerId].filter(
      (id): id is string => !!id,
    );
    const partners = await prisma.partner.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameOf = (id: string | null) =>
      partners.find((partner) => partner.id === id)?.name ?? "none";
    changes.push(
      `the destination partner changed from ${nameOf(before.destinationPartnerId)} to ${nameOf(after.destinationPartnerId)}`,
    );
  }

  if (before.ownerId !== after.ownerId) {
    const ids = [before.ownerId, after.ownerId].filter(
      (id): id is string => !!id,
    );
    const owners = await prisma.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameOf = (id: string | null) =>
      owners.find((owner) => owner.id === id)?.name ?? "none";
    changes.push(
      `the owner changed from ${nameOf(before.ownerId)} to ${nameOf(after.ownerId)}`,
    );
  }

  if (before.notes !== after.notes) {
    changes.push(
      !before.notes
        ? "notes were added"
        : !after.notes
          ? "notes were removed"
          : "notes were edited",
    );
  }

  return changes.length > 0
    ? `Outcome was corrected: ${changes.join("; ")}.`
    : null;
};

const REVERSED_MESSAGE =
  "This outcome was reversed, so it can no longer be corrected.";

export type OutcomeCorrection = RecordedOutcome & {
  status: "corrected" | "unchanged";
  animalId: string;
};

/**
 * Corrects the day, notes, partner or owner of one outcome, and logs the
 * correction against its animal. A save that changes nothing writes neither.
 *
 * `options` is passed to the transaction this opens. The action passes none;
 * a test that holds the animal's lock while this waits on it passes a longer
 * timeout, because the transaction's clock includes the wait.
 */
export const recordOutcomeCorrection = async (
  outcomeId: string,
  values: OutcomeFormOutput,
  actorId: string,
  options?: { timeout: number },
): Promise<OutcomeCorrection> => {
  const { outcomeDate, outcomeType, destinationPartnerId, ownerId, notes } =
    values;

  const existingOutcome = await prisma.outcome.findUnique({
    where: { id: outcomeId },
    select: {
      animalId: true,
      outcomeDate: true,
      type: true,
      notes: true,
      destinationPartnerId: true,
      ownerId: true,
      reversedAt: true,
      fosterPlacement: { select: { id: true } },
    },
  });

  if (!existingOutcome) {
    throw new NotFoundError("Error: Outcome record not found.");
  }

  const { animalId } = existingOutcome;

  // A reversed outcome is kept as it stood when it was voided. Correcting it
  // afterwards would change a record that no longer counts for anything, and
  // blur what the reversal was a reversal of.
  if (existingOutcome.reversedAt) {
    throw new ConflictError(REVERSED_MESSAGE);
  }

  // The form disables the type select in edit mode, so a different type here
  // means the client and server disagree about what is editable. That is
  // refused outright rather than ignored, so the disagreement surfaces.
  //
  // The date, notes, partner and owner correct an attribute of the event that
  // happened. The type asserts a different event happened, and carries
  // structure the others do not: an adoption's link to the winning
  // application (which is what makes that application adopted and closes the
  // rest), the archive reason, and the partner or owner that only mean
  // something under one type. Retyping in place would have to rewire all of
  // that. Reversing the outcome and recording the right one does it through
  // the path that already knows how, and keeps the mistake on the record.
  if (outcomeType !== existingOutcome.type) {
    throw new PreconditionFailedError(
      "The outcome type can't be changed once an outcome is recorded. To fix a wrong type, reverse this outcome and record the right one.",
    );
  }

  // The partner only applies to a transfer and the owner only to a return to
  // owner, so each is dropped for any other type.
  //
  // Re-picking the day already on record submits the same day back, so the
  // comparison below finds nothing changed and no correction is logged for
  // it. The picker cannot express anything finer than a day, which is what
  // makes the comparison exact.
  const nextValues: OutcomeCorrectionFields = {
    outcomeDate,
    notes: notes || null,
    destinationPartnerId:
      outcomeType === OutcomeType.TRANSFER_OUT
        ? destinationPartnerId || null
        : null,
    ownerId:
      outcomeType === OutcomeType.RETURN_TO_OWNER ? ownerId || null : null,
  };

  const changeSummary = await describeOutcomeCorrection(
    {
      ...existingOutcome,
      outcomeDate: calendarDay(existingOutcome.outcomeDate),
    },
    nextValues,
    !!existingOutcome.fosterPlacement,
  );

  // A save that changes nothing leaves no trace in the animal's history.
  if (!changeSummary) {
    return { status: "unchanged", animalId, fosterPersonId: null };
  }

  const fosterPersonId = await prisma.$transaction(async (tx) => {
    // Taken before the day is checked, so the animal's other intakes and
    // outcomes are still as the check reads them when the correction is
    // written. No person lock is held here, so this keeps the order
    // `lockAnimal` documents.
    await lockAnimal(tx, animalId);

    // Read again behind the lock. A reversal takes the same lock, so this
    // sees one that landed since the read above, and a reversed outcome is
    // no longer on the timeline the check reads.
    const stored = await tx.outcome.findUnique({
      where: { id: outcomeId },
      select: {
        outcomeDate: true,
        reversedAt: true,
        // The placement this outcome ended, when it ended one: a conversion,
        // or an outcome recorded while the animal was in foster. Its end is
        // the outcome's day, so it moves with the day.
        fosterPlacement: {
          select: {
            id: true,
            startDate: true,
            fosterProfile: {
              select: { person: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!stored || stored.reversedAt) {
      throw new ConflictError(REVERSED_MESSAGE);
    }
    const placement = stored.fosterPlacement;

    // Only a new day is checked: a save that leaves the day alone moves
    // nothing, so a notes fix on an animal whose timeline already has a break
    // is not refused for it. The day is compared with the one stored now,
    // not the one read above, so a correction racing another that moved the
    // day is checked against where the outcome actually sits.
    const dayMoves = calendarDay(stored.outcomeDate) !== nextValues.outcomeDate;
    if (dayMoves) {
      const refusal = await checkTimelineChange(tx, animalId, {
        kind: "moveOutcome",
        outcomeId,
        day: nextValues.outcomeDate,
      });
      if (refusal) {
        throw new TimelineOrderError(refusal, "outcomeDate");
      }
      if (placement && nextValues.outcomeDate < placement.startDate) {
        throw new TimelineOrderError(
          placementStartRefusal(
            placement.fosterProfile.person.name,
            placement.startDate,
          ),
          "outcomeDate",
        );
      }
    }

    // Guarded as well as checked above, so that nothing reaching this without
    // the lock can correct an outcome already reversed.
    const updated = await tx.outcome.updateMany({
      where: { id: outcomeId, reversedAt: null },
      data: nextValues,
    });
    if (updated.count === 0) {
      throw new ConflictError(REVERSED_MESSAGE);
    }

    if (placement && dayMoves) {
      await tx.fosterPlacement.update({
        where: { id: placement.id },
        data: { endDate: nextValues.outcomeDate },
      });
    }

    await tx.animalActivityLog.create({
      data: {
        animalId,
        activityType: AnimalActivityType.OUTCOME_CORRECTED,
        changedById: actorId,
        changeSummary,
      },
    });

    return placement && dayMoves ? placement.fosterProfile.person.id : null;
  }, options);

  return { status: "corrected", animalId, fosterPersonId };
};
