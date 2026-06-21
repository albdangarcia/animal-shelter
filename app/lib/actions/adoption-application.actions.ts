"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../prisma";
import { StaffUpdateAppFormState } from "../form-state-types";
import { StaffUpdateAdoptionAppFormSchema } from "../zod-schemas/application.schemas";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { ApplicationStatus, AnimalListingStatus, Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { ConflictError } from "../utils/errors";
import { z } from "zod";

const _staffUpdateAdoptionApp = async (
  adoptionAppId: string,
  prevState: StaffUpdateAppFormState,
  formData: FormData
): Promise<StaffUpdateAppFormState> => {
  const session = await auth();
  if (!session?.user?.personId) {
    return {
      message:
        "Unauthorized: You must be logged in with a valid user profile to perform this action.",
    };
  }
  const currentPersonId = session.user.personId;

  const parsedAdoptionAppId = cuidSchema.safeParse(adoptionAppId);
  if (!parsedAdoptionAppId.success) {
    return { message: "Invalid Adoption Application ID format." };
  }
  const validatedAdoptionAppId = parsedAdoptionAppId.data;

  let existingApplication;
  try {
    existingApplication = await prisma.adoptionApplication.findUnique({
      where: { id: validatedAdoptionAppId },
      select: { status: true, animalId: true },
    });
    if (!existingApplication) {
      return { message: "Adoption Application not found." };
    }
  } catch (error) {
    console.error("Database error fetching existing application:", error);
    return {
      message: "Database Error: Failed to retrieve application details.",
    };
  }

  const validatedFields = StaffUpdateAdoptionAppFormSchema.safeParse({
    status: formData.get("status") || undefined,
    internalNotes: formData.get("internalNotes") ?? undefined,
    statusChangeReason: formData.get("statusChangeReason") ?? undefined,
  });

  if (!validatedFields.success) {
    console.error(
      "Validation error in staff update adoption application:",
      validatedFields.error
    );
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message:
        "Missing or Invalid Fields. Failed to Update Adoption Application.",
    };
  }

  const {
    status: newStatus,
    internalNotes,
    statusChangeReason,
  } = validatedFields.data;

  const isStatusActuallyChanging =
    newStatus !== undefined && newStatus !== existingApplication.status;

  if (isStatusActuallyChanging) {
    const isExemptedChange =
      existingApplication.status === ApplicationStatus.PENDING &&
      newStatus === ApplicationStatus.REVIEWING;
    if (
      !isExemptedChange &&
      (!statusChangeReason || statusChangeReason.trim() === "")
    ) {
      return {
        message:
          "Validation Error: A reason for the status change is required.",
        errors: {
          statusChangeReason: ["A reason for the status change is required."],
        },
      };
    }
  }

  const applicationUpdateData: Prisma.AdoptionApplicationUpdateInput = {};
  if (isStatusActuallyChanging) {
    applicationUpdateData.status = newStatus;
  }
  if (internalNotes !== undefined) {
    applicationUpdateData.internalNotes =
      internalNotes.trim() === "" ? null : internalNotes;
  }

  if (Object.keys(applicationUpdateData).length === 0) {
    return { message: "No changes provided to update the application." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Animal status management based on application status changes.
      if (existingApplication.animalId && isStatusActuallyChanging) {
        if (newStatus === ApplicationStatus.APPROVED) {
          // Perform an atomic update. This command will only succeed if the animal's
          // ID matches AND its listingStatus is currently 'PUBLISHED'.
          const updateResult = await tx.animal.updateMany({
            where: {
              id: existingApplication.animalId,
              listingStatus: AnimalListingStatus.PUBLISHED,
            },
            data: {
              listingStatus: AnimalListingStatus.PENDING_ADOPTION,
            },
          });

          // If updateResult.count is 0, it means the 'where' clause failed.
          // This happens if another request already changed the status from PUBLISHED.
          if (updateResult.count === 0) {
            throw new ConflictError(
              "This animal is no longer available for adoption. Another application may have just been approved."
            );
          }
        }
        // If a previously approved application is withdrawn or rejected, make the animal available again.
        else if (
          existingApplication.status === ApplicationStatus.APPROVED &&
          (newStatus === ApplicationStatus.WITHDRAWN ||
            newStatus === ApplicationStatus.REJECTED)
        ) {
          await tx.animal.updateMany({
            where: {
              id: existingApplication.animalId,
              listingStatus: AnimalListingStatus.PENDING_ADOPTION,
            },
            data: { listingStatus: AnimalListingStatus.PUBLISHED },
          });
        }
      }

      if (Object.keys(applicationUpdateData).length > 0) {
        await tx.adoptionApplication.update({
          where: { id: validatedAdoptionAppId },
          data: applicationUpdateData,
        });
      }

      if (isStatusActuallyChanging && newStatus) {
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: validatedAdoptionAppId,
            status: newStatus,
            statusChangeReason:
              statusChangeReason || "Application moved to review.",
            changedById: currentPersonId,
          },
        });
      }
    });
  } catch (error) {
    console.error("Database Error during transaction:", error);
    if (error instanceof ConflictError) {
      return { message: error.message };
    }
    return {
      message:
        "Database Error: Failed to Update Adoption Application and associated records.",
    };
  }

  revalidatePath("/dashboard/adoption-applications");
  revalidatePath(`/dashboard/adoption-applications/${validatedAdoptionAppId}`);

  redirect(`/dashboard/adoption-applications/`);
};

export const staffUpdateAdoptionApp = RequirePermission(
  AppPermissions.APPLICATIONS_MANAGE_STATUS
)(_staffUpdateAdoptionApp);
