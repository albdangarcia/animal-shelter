"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import {
  OutcomeFormSchema,
  ReverseOutcomeSchema,
  type OutcomeFormInput,
  type ReverseOutcomeInput,
} from "../zod-schemas/outcome.schema";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationStatus,
  OutcomeType,
} from "@/prisma/generated/enums";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatus,
  lockAnimal,
} from "../data/application-status.data";
import {
  assertNoLiveAdoptionOutcome,
  recordOutcomeReversal,
  type OutcomeReversal,
} from "../services/outcome-reversal";
import {
  calendarDay,
  formatShelterDay,
  type CalendarDay,
} from "../utils/shelter-day";

const OUTCOMES_PATH = "/dashboard/outcomes";
const ADOPTION_APPLICATIONS_PATH = "/dashboard/adoption-applications";

interface CreateOutcomeIds {
  animalId: string;
  adoptionApplicationId?: string;
}

const _createOutcome = async (
  user: SessionUser,
  ids: CreateOutcomeIds,
  values: OutcomeFormInput,
): Promise<FormResult<OutcomeFormInput>> => {
  const staffMemberId = user.personId;

  const { animalId, adoptionApplicationId } = ids;

  // The ids arrive as ordinary arguments now rather than through .bind(), so
  // they are checked like any other caller-supplied input.
  if (!cuidSchema.safeParse(animalId).success) {
    return { ok: false, message: "Invalid animal ID format." };
  }
  if (
    adoptionApplicationId &&
    !cuidSchema.safeParse(adoptionApplicationId).success
  ) {
    return { ok: false, message: "Invalid adoption application ID format." };
  }

  const validatedFields = OutcomeFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or Invalid Fields. Failed to Process Outcome.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<OutcomeFormInput>,
    };
  }

  const { outcomeDate, outcomeType, destinationPartnerId, ownerId, notes } =
    validatedFields.data;

  try {
    await prisma.$transaction(async (tx) => {
      // Held until commit, so the listing status and unit read here are
      // still the animal's when the update below archives it and clears the
      // unit. Both are stored on the outcome, and are what a reversal of the
      // outcome restores.
      await lockAnimal(tx, animalId);
      const animal = await tx.animal.findUnique({
        where: { id: animalId },
        select: { listingStatus: true, currentUnitId: true },
      });

      // Attempt to archive the animal first.
      // This update will only succeed if the animal is not already archived.
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

      // Check if the update succeeded.
      if (!animal || updateResult.count === 0) {
        // If count is 0, another process archived the animal first. Abort.
        throw new ConflictError(
          "This animal has already been processed for an outcome.",
        );
      }

      // An application's adopted status is derived from an adoption outcome
      // for its own animal that links to it. A link on any other outcome, or
      // from another animal's outcome, would mark the application adopted
      // here while its animal's record says otherwise. The form never sends
      // either; a direct call must not be able to.
      if (adoptionApplicationId && outcomeType !== OutcomeType.ADOPTION) {
        throw new PreconditionFailedError(
          "Only an adoption outcome can be recorded against an adoption application.",
        );
      }

      // If the outcome is an ADOPTION, ensure it was published
      if (outcomeType === OutcomeType.ADOPTION) {
        if (!adoptionApplicationId) {
          throw new PreconditionFailedError(
            "An adoption application ID is required for adoption outcomes.",
          );
        }

        const application = await tx.adoptionApplication.findUnique({
          where: { id: adoptionApplicationId },
          select: DERIVATION_APPLICATION_SELECT,
        });

        if (application && application.animalId !== animalId) {
          throw new PreconditionFailedError(
            "Cannot process adoption: The application is for a different animal.",
          );
        }
        if (application) {
          await assertNoLiveAdoptionOutcome(tx, application.id);
        }
        // Approved as the application effectively is, not as the column
        // says: one approved during an earlier stay, and adopted or closed by
        // that stay's outcome, still stores APPROVED. Archiving the animal
        // above holds the lock every application status change takes, so
        // this cannot move before the outcome is written.
        if (
          !application ||
          (await effectiveApplicationStatus(application, tx)) !==
            ApplicationStatus.APPROVED
        ) {
          throw new PreconditionFailedError(
            "Cannot process adoption: The application has not been approved.",
          );
        }
      }

      // Create the Outcome record
      await tx.outcome.create({
        data: {
          outcomeDate,
          type: outcomeType,
          // `notes` now arrives as "" from a cleared textarea rather than
          // undefined, so it has to be mapped to null for the nullable column.
          notes: notes || null,
          previousListingStatus: animal.listingStatus,
          animal: { connect: { id: animalId } },
          staffMember: { connect: { id: staffMemberId } },
          // Conditionally connect relationships
          ...(adoptionApplicationId && {
            adoptionApplication: { connect: { id: adoptionApplicationId } },
          }),
          ...(destinationPartnerId && {
            destinationPartner: { connect: { id: destinationPartnerId } },
          }),
          ...(ownerId && {
            owner: { connect: { id: ownerId } },
          }),
          ...(animal.currentUnitId && {
            previousUnit: { connect: { id: animal.currentUnitId } },
          }),
        },
      });

      // Log this closing event in the animal's history, mirroring the
      // INTAKE_PROCESSED log written on every intake — without this, the
      // activity feed shows consecutive intakes with no outcome between them.
      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.OUTCOME_PROCESSED,
          changedById: staffMemberId,
          changeSummary: `Animal was processed for outcome: ${outcomeType
            .replace(/_/g, " ")
            .toLowerCase()}.`,
        },
      });

      // Nothing is written onto the applications. The one this outcome links
      // to now reads as adopted, and every other application still open on
      // the animal reads as closed, because both are derived from this
      // outcome (`deriveApplicationStatus`).
    });
  } catch (error) {
    console.error("Database error processing outcome:", error);
    if (
      error instanceof ConflictError ||
      error instanceof PreconditionFailedError
    ) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: "Database Error: Failed to process outcome.",
    };
  }

  revalidatePath("/dashboard/animals");
  revalidatePath(`/dashboard/animals/${animalId}`);

  if (adoptionApplicationId) {
    revalidatePath(ADOPTION_APPLICATIONS_PATH);
    revalidatePath(
      `${ADOPTION_APPLICATIONS_PATH}/${adoptionApplicationId}/edit`,
    );
  }

  return {
    ok: true,
    message: "Outcome processed successfully.",
    redirectTo: OUTCOMES_PATH,
  };
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
const describeOutcomeCorrection = async (
  before: OutcomeCorrectionFields,
  after: OutcomeCorrectionFields,
): Promise<string | null> => {
  const changes: string[] = [];

  if (before.outcomeDate !== after.outcomeDate) {
    changes.push(
      `the date changed from ${formatShelterDay(before.outcomeDate)} to ${formatShelterDay(after.outcomeDate)}`,
    );
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

const _updateOutcome = async (
  user: SessionUser,
  outcomeId: string,
  values: OutcomeFormInput,
): Promise<FormResult<OutcomeFormInput>> => {
  const staffMemberId = user.personId;

  const parsedId = cuidSchema.safeParse(outcomeId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid outcome ID format." };
  }

  const validatedFields = OutcomeFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or Invalid Fields. Failed to Update Outcome.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<OutcomeFormInput>,
    };
  }

  const { outcomeDate, outcomeType, destinationPartnerId, ownerId, notes } =
    validatedFields.data;

  // Declared outside the try so the revalidate calls below can use it.
  let animalId: string;

  try {
    const existingOutcome = await prisma.outcome.findUnique({
      where: { id: parsedId.data },
      select: {
        animalId: true,
        outcomeDate: true,
        type: true,
        notes: true,
        destinationPartnerId: true,
        ownerId: true,
        reversedAt: true,
      },
    });

    if (!existingOutcome) {
      throw new NotFoundError("Error: Outcome record not found.");
    }

    animalId = existingOutcome.animalId;

    // A reversed outcome is kept as it stood when it was voided. Correcting
    // it afterwards would change a record that no longer counts for anything,
    // and blur what the reversal was a reversal of.
    if (existingOutcome.reversedAt) {
      return {
        ok: false,
        message: "This outcome was reversed, so it can no longer be corrected.",
      };
    }

    // The form disables the type select in edit mode, so a different type
    // here means the client and server disagree about what is editable. That
    // is refused outright rather than ignored, so the disagreement surfaces.
    //
    // The date, notes, partner and owner correct an attribute of the event
    // that happened. The type asserts a different event happened, and carries
    // structure the others do not: an adoption's link to the winning
    // application (which is what makes that application adopted and closes
    // the rest), the archive reason, and the partner or owner that only mean
    // something under one type. Retyping in place would have to rewire all of
    // that. Reversing the outcome and recording the right one does it through
    // the path that already knows how, and keeps the mistake on the record.
    if (outcomeType !== existingOutcome.type) {
      return {
        ok: false,
        message:
          "The outcome type can't be changed once an outcome is recorded. To fix a wrong type, reverse this outcome and record the right one.",
      };
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
      { ...existingOutcome, outcomeDate: calendarDay(existingOutcome.outcomeDate) },
      nextValues,
    );

    // A save that changes nothing leaves no trace in the animal's history.
    if (!changeSummary) {
      return {
        ok: true,
        message: "No changes to save.",
        redirectTo: OUTCOMES_PATH,
      };
    }

    await prisma.$transaction(async (tx) => {
      // Guarded, since the outcome could be reversed between the read above
      // and this write.
      const updated = await tx.outcome.updateMany({
        where: { id: parsedId.data, reversedAt: null },
        data: nextValues,
      });
      if (updated.count === 0) {
        throw new ConflictError(
          "This outcome was reversed, so it can no longer be corrected.",
        );
      }

      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.OUTCOME_CORRECTED,
          changedById: staffMemberId,
          changeSummary,
        },
      });
    });
  } catch (error) {
    console.error("Database error updating outcome:", error);
    if (error instanceof NotFoundError || error instanceof ConflictError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Database Error: Failed to update outcome." };
  }

  revalidatePath(OUTCOMES_PATH);
  revalidatePath(`/dashboard/animals/${animalId}`);

  return {
    ok: true,
    message: "Outcome updated successfully.",
    redirectTo: OUTCOMES_PATH,
  };
};

/**
 * Reverse an outcome recorded in error. The work, and why a reversal voids the
 * outcome rather than deleting it, is in `outcome-reversal`; this is the
 * authorization, the transaction and the cache invalidation around it.
 */
const _reverseOutcome = async (
  user: SessionUser,
  outcomeId: string,
  values: ReverseOutcomeInput,
): Promise<FormResult<ReverseOutcomeInput>> => {
  const parsedId = cuidSchema.safeParse(outcomeId);
  if (!parsedId.success) {
    return { ok: false, message: "Invalid outcome ID format." };
  }

  const validatedFields = ReverseOutcomeSchema.safeParse(values);
  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or Invalid Fields. Failed to Reverse Outcome.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<ReverseOutcomeInput>,
    };
  }

  let reversal: OutcomeReversal;
  try {
    reversal = await prisma.$transaction((tx) =>
      recordOutcomeReversal(
        tx,
        parsedId.data,
        validatedFields.data.reason,
        user.personId,
      ),
    );
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ConflictError ||
      error instanceof PreconditionFailedError
    ) {
      return { ok: false, message: error.message };
    }
    console.error("Database error reversing outcome:", error);
    return {
      ok: false,
      message: "Database Error: Failed to reverse outcome.",
    };
  }

  revalidatePath(OUTCOMES_PATH);
  revalidatePath("/dashboard/animals");
  revalidatePath(`/dashboard/animals/${reversal.animalId}`);
  // Every application on the animal can read differently now: the adopter's
  // is no longer adopted, and the ones the outcome closed are open again.
  revalidatePath(ADOPTION_APPLICATIONS_PATH);
  if (reversal.adoptionApplicationId) {
    revalidatePath(
      `${ADOPTION_APPLICATIONS_PATH}/${reversal.adoptionApplicationId}/edit`,
    );
  }
  if (reversal.reopenedPlacementId) {
    revalidatePath("/dashboard/fosters");
  }
  if (reversal.restoredUnitId) {
    revalidatePath("/dashboard/locations");
  }

  return {
    ok: true,
    message: `Outcome reversed. ${reversal.effects}`,
    redirectTo: OUTCOMES_PATH,
  };
};

export const createOutcome = withAuthenticatedUser(
  RequirePermission(AppPermissions.OUTCOMES_MANAGE)(_createOutcome),
);

export const updateOutcome = withAuthenticatedUser(
  RequirePermission(AppPermissions.OUTCOMES_MANAGE)(_updateOutcome),
);

export const reverseOutcome = withAuthenticatedUser(
  RequirePermission(AppPermissions.OUTCOMES_REVERSE)(_reverseOutcome),
);