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
  type OutcomeFormInput,
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
import { CLOSURE_REASON_BY_OUTCOME } from "../utils/application-status";
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
          // unit indefinitely. OUTCOME_PROCESSED is already logged below and
          // covers the relocation; a dedicated LOCATION_CHANGE would need an
          // extra read just to name the vacated unit, so it is deliberately
          // omitted here.
          currentUnitId: null,
        },
      });

      // Check if the update succeeded.
      if (updateResult.count === 0) {
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
          select: { status: true, animalId: true },
        });

        if (application && application.animalId !== animalId) {
          throw new PreconditionFailedError(
            "Cannot process adoption: The application is for a different animal.",
          );
        }
        if (application?.status !== ApplicationStatus.APPROVED) {
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

      // If this is an adoption, update the winning application's status
      if (adoptionApplicationId) {
        await tx.adoptionApplication.update({
          where: { id: adoptionApplicationId },
          data: { status: ApplicationStatus.ADOPTED },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: adoptionApplicationId,
            status: ApplicationStatus.ADOPTED,
            statusChangeReason: "Animal adopted by applicant.",
            changedById: staffMemberId,
          },
        });
      }

      // Close ALL other open applications for this animal
      const otherAppsToClose = await tx.adoptionApplication.findMany({
        where: {
          animalId: animalId,
          // Exclude the winning application if this is an adoption
          id: { not: adoptionApplicationId },
          status: {
            in: [
              ApplicationStatus.PENDING,
              ApplicationStatus.REVIEWING,
              ApplicationStatus.WAITLISTED,
              ApplicationStatus.APPROVED, // Also close previously approved apps
            ],
          },
        },
        select: { id: true },
      });

      const appIdsToClose = otherAppsToClose.map((app) => app.id);

      if (appIdsToClose.length > 0) {
        await tx.adoptionApplication.updateMany({
          where: { id: { in: appIdsToClose } },
          data: { status: ApplicationStatus.CLOSED },
        });

        const historyRecords = appIdsToClose.map((appId) => ({
          applicationId: appId,
          status: ApplicationStatus.CLOSED,
          statusChangeReason: CLOSURE_REASON_BY_OUTCOME[outcomeType],
          changedById: staffMemberId,
        }));
        await tx.applicationStatusHistory.createMany({
          data: historyRecords,
        });
      }
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
      },
    });

    if (!existingOutcome) {
      throw new NotFoundError("Error: Outcome record not found.");
    }

    animalId = existingOutcome.animalId;

    // The form disables the type select in edit mode, so a different type
    // here means the client and server disagree about what is editable. That
    // is refused outright rather than ignored, so the disagreement surfaces.
    //
    // The type is frozen because:
    //  - Compliance reports count outcomes by type, so changing it in place
    //    rewrites a figure that may already have been reported, with no
    //    record that it moved.
    //  - For an adoption, the type also carries the link to the winning
    //    application. Moving it off ADOPTION would clear that link and strand
    //    the application at ADOPTED, which has no allowed transitions out.
    //  - Fixing a wrongly-typed outcome is a reversal, not an edit, and there
    //    is no reversal path yet. Freezing the type beats half-correcting it.
    if (outcomeType !== existingOutcome.type) {
      return {
        ok: false,
        message:
          "The outcome type can't be changed once an outcome is recorded.",
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
      await tx.outcome.update({
        where: { id: parsedId.data },
        data: nextValues,
      });

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
    if (error instanceof NotFoundError) {
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

export const createOutcome = withAuthenticatedUser(
  RequirePermission(AppPermissions.OUTCOMES_MANAGE)(_createOutcome),
);

export const updateOutcome = withAuthenticatedUser(
  RequirePermission(AppPermissions.OUTCOMES_MANAGE)(_updateOutcome),
);