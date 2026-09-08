"use server";

import { cuidSchema } from "../zod-schemas/common.schemas";
import prisma from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { AnimalListingStatus, ApplicationStatus } from "@/prisma/generated/enums";
import {
  MyAdoptionAppFormSchema,
  toAdoptionApplicantData,
  type MyAdoptionAppFormInput,
} from "../zod-schemas/myAdoptionApplication.schema";
import { toHouseholdData } from "../zod-schemas/household-profile.schemas";
import { SessionUser, withAuthenticatedUser } from "../auth/protected-actions";
import { ActionResult } from "../types";
import { z } from "zod";
import { isOwnedByUser } from "../auth/ownership";
import { Prisma } from "@/prisma/generated/client";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

type MyAdoptionAppResult = FormResult<MyAdoptionAppFormInput>;

// Where both actions send the user once the write lands. Returned as
// redirectTo rather than passed to redirect(): redirect() never returns, so
// these forms previously showed no success toast at all.
const MY_APPLICATIONS_PATH = "/dashboard/my-adoption-applications";

const _updateMyAdoptionApp = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  applicationId: string, // Adoption Application ID from the URL parameters
  values: MyAdoptionAppFormInput,
): Promise<MyAdoptionAppResult> => {
  // Validate the applicationId
  const parsedApplicationId = cuidSchema.safeParse(applicationId);
  if (!parsedApplicationId.success) {
    return {
      ok: false,
      message: "Invalid Adoption Application ID format.",
    };
  }
  const validatedApplicationId = parsedApplicationId.data;

  // Verify that the application belongs to the current user
  let application;
  try {
    application = await prisma.adoptionApplication.findUnique({
      where: { id: validatedApplicationId },
      select: { applicantId: true, status: true },
    });
  } catch (error) {
    console.error(
      "Database error while verifying application ownership:",
      error,
    );
    return {
      ok: false,
      message: "Database Error: Failed to verify application ownership.",
    };
  }

  if (!isOwnedByUser(application, user.personId)) {
    return { ok: false, message: "Adoption Application not found." };
  }

  // Check if the application status prevents modification
  const nonEditableStatuses: ApplicationStatus[] = [
    ApplicationStatus.REVIEWING,
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ADOPTED,
    ApplicationStatus.CLOSED,
  ];

  if (nonEditableStatuses.includes(application.status)) {
    return {
      ok: false,
      message: `Cannot update application. Its status is currently "${application.status}". Applications cannot be modified if their status is REVIEWING, APPROVED, REJECTED, WITHDRAWN, ADOPTED, or CLOSED.`,
    };
  }

  // Re-validate on the server: the client's copy of this schema is UX, and
  // this function is reachable by direct POST.
  const validatedFields = MyAdoptionAppFormSchema.safeParse(values);

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing Fields. Failed to Update Adoption Application.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<MyAdoptionAppFormInput>,
    };
  }

  // The two shared mappers cover every column on the row between them, so the
  // string -> boolean/number/array conversions are no longer written out by
  // hand here (and identically again in the staff actions).
  const dataToUpdate = {
    ...toAdoptionApplicantData(validatedFields.data),
    ...toHouseholdData(validatedFields.data),
  };

  // Update the adoption application
  try {
    await prisma.adoptionApplication.update({
      where: { id: validatedApplicationId },
      data: dataToUpdate,
    });
  } catch (error) {
    console.error(
      `Database Error updating adoption application ${validatedApplicationId}:`,
      error,
    );
    return {
      ok: false,
      message: "Database Error: Failed to Update Adoption Application.",
    };
  }

  // Revalidate relevant paths
  revalidatePath(MY_APPLICATIONS_PATH);
  revalidatePath(`${MY_APPLICATIONS_PATH}/${validatedApplicationId}/edit`);

  return {
    ok: true,
    message: "Application updated successfully.",
    redirectTo: MY_APPLICATIONS_PATH,
  };
};

const _withdrawMyAdoptionApplication = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  applicationId: string,
): Promise<ActionResult> => {
  // Validate the applicationId
  const parsedApplicationId = cuidSchema.safeParse(applicationId);
  if (!parsedApplicationId.success) {
    return {
      success: false,
      message: "Invalid Adoption Application ID format.",
    };
  }
  const validatedApplicationId = parsedApplicationId.data;

  // Declare 'application' here to make it accessible in the transaction block
  let application;

  // Verify ownership and status
  try {
    application = await prisma.adoptionApplication.findUnique({
      where: { id: validatedApplicationId },
      select: { applicantId: true, status: true, animalId: true },
    });
  } catch (error) {
    console.error(
      "Error verifying application ownership for withdrawal:",
      error,
    );
    return {
      success: false,
      message:
        "A server error occurred while verifying the application. Please try again.",
    };
  }

  if (!isOwnedByUser(application, user.personId)) {
    return { success: false, message: "Adoption Application not found." };
  }

  const nonWithdrawableStatuses: ApplicationStatus[] = [
    ApplicationStatus.ADOPTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.REJECTED,
    // Nothing left to withdraw from: the animal has already left the shelter.
    ApplicationStatus.CLOSED,
  ];

  if (nonWithdrawableStatuses.includes(application.status)) {
    return {
      success: false,
      message: `Cannot withdraw application. Its status is currently "${application.status}".`,
    };
  }

  // Update the application status and create a history record
  try {
    await prisma.$transaction(async (tx) => {
      // Update the application's status to WITHDRAWN
      await tx.adoptionApplication.update({
        where: { id: validatedApplicationId },
        data: { status: ApplicationStatus.WITHDRAWN },
      });

      // Create the history record
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: validatedApplicationId,
          status: ApplicationStatus.WITHDRAWN,
          statusChangeReason: "Application withdrawn by user.",
          changedById: user.personId,
        },
      });

      if (application.status === ApplicationStatus.APPROVED) {
        // it will only update if the animal is PENDING_ADOPTION
        await tx.animal.updateMany({
          where: {
            id: application.animalId,
            listingStatus: AnimalListingStatus.PENDING_ADOPTION,
          },
          data: { listingStatus: AnimalListingStatus.PUBLISHED },
        });
      }
    });
  } catch (error) {
    console.error(
      `Database Error withdrawing adoption application ${validatedApplicationId}:`,
      error,
    );
    return {
      success: false,
      message: "Database Error: Failed to withdraw Adoption Application.",
    };
  }

  revalidatePath(`${MY_APPLICATIONS_PATH}/${validatedApplicationId}/edit`);

  return { success: true, message: "Application withdrawn successfully." };
};

const _reactivateMyAdoptionApplication = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  applicationId: string,
): Promise<ActionResult> => {
  // Validate the applicationId
  const parsedApplicationId = cuidSchema.safeParse(applicationId);
  if (!parsedApplicationId.success) {
    return {
      success: false,
      message: "Invalid Adoption Application ID format.",
    };
  }
  const validatedApplicationId = parsedApplicationId.data;

  // Verify ownership and status
  let application;
  try {
    application = await prisma.adoptionApplication.findUnique({
      where: { id: validatedApplicationId },
      select: {
        applicantId: true,
        status: true,
        animal: { select: { listingStatus: true } },
      },
    });
  } catch (error) {
    console.error("Error verifying application for reactivation:", error);
    return {
      success: false,
      message:
        "A server error occurred while verifying the application. Please try again.",
    };
  }

  if (!isOwnedByUser(application, user.personId)) {
    return { success: false, message: "Adoption Application not found." };
  }

  if (application.animal.listingStatus !== "PUBLISHED") {
    return {
      success: false,
      message:
        "Cannot reactivate application. This animal is no longer available for adoption.",
    };
  }

  if (application.status !== ApplicationStatus.WITHDRAWN) {
    return {
      success: false,
      message: `Cannot reactivate application. Its status is currently "${application.status}".`,
    };
  }

  // Update the application status to PENDING and create a history record
  try {
    await prisma.$transaction(async (tx) => {
      // Update the application's current status
      await tx.adoptionApplication.update({
        where: { id: validatedApplicationId },
        data: { status: ApplicationStatus.PENDING },
      });
      // Create the history record for the audit trail
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: validatedApplicationId,
          status: ApplicationStatus.PENDING,
          statusChangeReason: "Application reactivated by user.",
          changedById: user.personId,
        },
      });
    });
  } catch (error) {
    console.error(
      `Database Error reactivating adoption application ${validatedApplicationId}:`,
      error,
    );
    return {
      success: false,
      message: "Database Error: Failed to reactivate Adoption Application.",
    };
  }

  revalidatePath("/dashboard/my-adoption-applications");

  return { success: true, message: "Application reactivated successfully." };
};

// Server action for the user to submit an application
const _createMyAdoptionApp = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  values: MyAdoptionAppFormInput,
): Promise<MyAdoptionAppResult> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return {
      ok: false,
      message: "Invalid Animal ID format.",
    };
  }
  const validatedAnimalId = parsedAnimalId.data;

  const validatedFields = MyAdoptionAppFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing Fields. Failed to Submit Application.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<MyAdoptionAppFormInput>,
    };
  }

  const {
    applicantName,
    applicantEmail,
    applicantPhone,
    applicantAddressLine1,
    applicantAddressLine2,
    applicantCity,
    applicantState,
    applicantZipCode,
  } = validatedFields.data;

  // The application row and the reusable HouseholdProfile take the same
  // household columns, so they share one mapper rather than the profile being
  // rebuilt field by field from the application's already-converted values.
  const householdProfileData = toHouseholdData(validatedFields.data);

  const dataToCreate = {
    ...toAdoptionApplicantData(validatedFields.data),
    ...householdProfileData,
    applicantId: user.personId,
    animalId: validatedAnimalId,
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        const animal = await tx.animal.findUnique({
          where: { id: validatedAnimalId },
          select: { listingStatus: true },
        });

        if (animal?.listingStatus !== "PUBLISHED") {
          throw new Error("This animal is no longer available for adoption.");
        }

        await tx.adoptionApplication.create({
          data: {
            ...dataToCreate,
            history: {
              create: {
                status: "PENDING",
                statusChangeReason: "Application submitted by user.",
                changedById: user.personId,
              },
            },
          },
        });

        // Keep the user's reusable Household Profile in sync with what they
        // just submitted, so future applications come prefilled.
        await tx.householdProfile.upsert({
          where: { personId: user.personId },
          create: { personId: user.personId, ...householdProfileData },
          update: householdProfileData,
        });

        // Best-effort sync of contact info back to Person. If the email
        // collides with another Person's record, skip the sync rather than
        // failing the whole application.
        try {
          await tx.person.update({
            where: { id: user.personId },
            data: {
              name: applicantName,
              email: applicantEmail || null,
              phone: applicantPhone,
              address: applicantAddressLine2
                ? `${applicantAddressLine1}, ${applicantAddressLine2}`
                : applicantAddressLine1,
              city: applicantCity,
              state: applicantState,
              zipCode: applicantZipCode,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            console.warn(
              "Skipped syncing Person contact info due to email conflict.",
              error,
            );
          } else {
            throw error;
          }
        }
      },
      {
        isolationLevel: "Serializable",
      },
    );
  } catch (error: unknown) {
    console.error("Error submitting adoption application:", error);
    return {
      ok: false,
      message:
        "Database Error: Failed to submit application. Please try again.",
    };
  }
  revalidatePath(`/pets/${validatedAnimalId}`);
  revalidatePath(MY_APPLICATIONS_PATH);

  return {
    ok: true,
    message: "Application submitted successfully.",
    redirectTo: MY_APPLICATIONS_PATH,
  };
};

export const updateMyAdoptionApp = withAuthenticatedUser(_updateMyAdoptionApp);

export const withdrawMyAdoptionApplication = withAuthenticatedUser(
  _withdrawMyAdoptionApplication,
);

export const createMyAdoptionApp = withAuthenticatedUser(_createMyAdoptionApp);

export const reactivateMyAdoptionApplication = withAuthenticatedUser(
  _reactivateMyAdoptionApplication,
);
