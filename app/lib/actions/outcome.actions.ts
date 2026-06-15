"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { Permissions } from "../auth/permissions";
import { OutcomeFormSchema } from "../zod-schemas/outcome.schema";
import {
  AnimalArchiveReason,
  AnimalListingStatus,
  ApplicationStatus,
  OutcomeType,
} from "@prisma/client";
import { OutcomeFormState } from "../form-state-types";
import { redirect } from "next/navigation";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";

// Helper function to map OutcomeType to AnimalArchiveReason
const getArchiveReasonFromOutcomeType = (
  outcomeType: OutcomeType,
): AnimalArchiveReason => {
  switch (outcomeType) {
    case "ADOPTION":
      return AnimalArchiveReason.ADOPTED_INTERNAL;
    case "TRANSFER_OUT":
      return AnimalArchiveReason.TRANSFERRED;
    case "RETURN_TO_OWNER":
      return AnimalArchiveReason.RETURNED_TO_OWNER;
    case "DECEASED":
      return AnimalArchiveReason.DECEASED;
    case "EUTHANIZED":
      return AnimalArchiveReason.EUTHANIZED;
    default:
      return AnimalArchiveReason.OTHER;
  }
};

interface CreateOutcomeIds {
  animalId: string;
  adoptionApplicationId?: string;
}

const _createOutcome = async (
  user: SessionUser,
  ids: CreateOutcomeIds,
  prevState: OutcomeFormState,
  formData: FormData,
): Promise<OutcomeFormState> => {
  const staffMemberId = user.personId;

  const { animalId, adoptionApplicationId } = ids;

  // Validate form fields
  const validatedFields = OutcomeFormSchema.safeParse({
    outcomeDate: new Date(formData.get("outcomeDate") as string),
    outcomeType: formData.get("outcomeType"),
    destinationPartnerId: formData.get("destinationPartnerId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or Invalid Fields. Failed to Process Outcome.",
    };
  }

  const { outcomeDate, outcomeType, destinationPartnerId, notes } =
    validatedFields.data;
  const archiveReason = getArchiveReasonFromOutcomeType(outcomeType);

  try {
    await prisma.$transaction(async (tx) => {
      // ATOMIC UPDATE: Attempt to archive the animal first.
      // This update will only succeed if the animal is not already archived.
      const updateResult = await tx.animal.updateMany({
        where: {
          id: animalId,
          listingStatus: { not: AnimalListingStatus.ARCHIVED },
        },
        data: {
          listingStatus: AnimalListingStatus.ARCHIVED,
          archiveReason: archiveReason,
        },
      });

      // Check if the update succeeded.
      if (updateResult.count === 0) {
        // If count is 0, another process archived the animal first. Abort.
        throw new ConflictError(
          "This animal has already been processed for an outcome.",
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
          select: { status: true },
        });

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
          notes,
          animal: { connect: { id: animalId } },
          staffMember: { connect: { id: staffMemberId } },
          // Conditionally connect relationships
          ...(adoptionApplicationId && {
            adoptionApplication: { connect: { id: adoptionApplicationId } },
          }),
          ...(destinationPartnerId && {
            destinationPartner: { connect: { id: destinationPartnerId } },
          }),
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

      // Find and reject ALL other open applications for this animal
      const otherAppsToReject = await tx.adoptionApplication.findMany({
        where: {
          animalId: animalId,
          // Exclude the winning application if this is an adoption
          id: { not: adoptionApplicationId },
          status: {
            in: [
              ApplicationStatus.PENDING,
              ApplicationStatus.REVIEWING,
              ApplicationStatus.WAITLISTED,
              ApplicationStatus.APPROVED, // Also reject previously approved apps
            ],
          },
        },
        select: { id: true },
      });

      const appIdsToReject = otherAppsToReject.map((app) => app.id);

      if (appIdsToReject.length > 0) {
        await tx.adoptionApplication.updateMany({
          where: { id: { in: appIdsToReject } },
          data: { status: ApplicationStatus.REJECTED },
        });

        // Use a generic reason that works for all outcomes
        const rejectionReason =
          "Application rejected as the animal is no longer available.";
        const historyRecords = appIdsToReject.map((appId) => ({
          applicationId: appId,
          status: ApplicationStatus.REJECTED,
          statusChangeReason: rejectionReason,
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
      return { message: error.message };
    }
    return {
      message: "Database Error: Failed to process outcome.",
    };
  }

  revalidatePath("/dashboard/animals");
  revalidatePath(`/dashboard/animals/${animalId}`);

  if (adoptionApplicationId) {
    revalidatePath("/dashboard/applications");
    revalidatePath(`/dashboard/applications/${adoptionApplicationId}`);
  }

  redirect("/dashboard/outcomes");
};

const _updateOutcome = async (
  outcomeId: string,
  prevState: OutcomeFormState,
  formData: FormData,
): Promise<OutcomeFormState> => {
  // Validate form fields
  const validatedFields = OutcomeFormSchema.safeParse({
    outcomeDate: new Date(formData.get("outcomeDate") as string),
    outcomeType: formData.get("outcomeType"),
    destinationPartnerId: formData.get("destinationPartnerId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing or Invalid Fields. Failed to Update Outcome.",
    };
  }

  const { outcomeDate, outcomeType, destinationPartnerId, notes } =
    validatedFields.data;
  const archiveReason = getArchiveReasonFromOutcomeType(outcomeType);

  try {
    const existingOutcome = await prisma.outcome.findUnique({
      where: { id: outcomeId },
      select: { animalId: true },
    });

    if (!existingOutcome) {
      throw new NotFoundError("Error: Outcome record not found.");
    }

    const animalId = existingOutcome.animalId;

    await prisma.$transaction(async (tx) => {
      await tx.outcome.update({
        where: { id: outcomeId },
        data: {
          outcomeDate,
          type: outcomeType,
          notes,
          destinationPartnerId:
            outcomeType === "TRANSFER_OUT" ? destinationPartnerId : null,
        },
      });

      // Update the animal's archive reason in case the type changed
      await tx.animal.update({
        where: { id: existingOutcome.animalId },
        data: { archiveReason: archiveReason },
      });
    });

    revalidatePath("/dashboard/outcomes");
    revalidatePath(`/dashboard/animals/${animalId}`);
  } catch (error) {
    console.error("Database error updating outcome:", error);
    if (error instanceof NotFoundError) {
      return { message: error.message };
    }
    return { message: "Database Error: Failed to update outcome." };
  }

  redirect("/dashboard/outcomes");
};

export const createOutcome = withAuthenticatedUser(
  RequirePermission(Permissions.OUTCOMES_MANAGE)(_createOutcome),
);

export const updateOutcome = RequirePermission(Permissions.OUTCOMES_MANAGE)(
  _updateOutcome,
);
