"use server";

import { MyAdoptionAppFormState } from "../form-state-types";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { prisma } from "../prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AnimalListingStatus, ApplicationStatus } from "@prisma/client";
import { MyAdoptionAppFormSchema } from "../zod-schemas/myApplication.schema";
import { SessionUser, withAuthenticatedUser } from "../auth/protected-actions";
import { ActionResult } from "../types";
import { z } from "zod";
import { isOwnedByUser } from "../auth/ownership";
import { Prisma } from "@prisma/client";

const _updateMyAdoptionApp = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  applicationId: string, // Adoption Application ID from the URL parameters
  prevState: MyAdoptionAppFormState,
  formData: FormData,
): Promise<MyAdoptionAppFormState> => {
  // Validate the applicationId
  const parsedApplicationId = cuidSchema.safeParse(applicationId);
  if (!parsedApplicationId.success) {
    return {
      message: "Invalid Adoption Application ID format.",
    };
  }
  const validatedApplicationId = parsedApplicationId.data;

  // Verify that the application belongs to the current user
  let application;
  try {
    application = await prisma.adoptionApplication.findUnique({
      where: { id: validatedApplicationId },
      select: { userId: true, status: true },
    });
  } catch (error) {
    console.error(
      "Database error while verifying application ownership:",
      error,
    );
    return {
      message: "Database Error: Failed to verify application ownership.",
    };
  }

  if (!isOwnedByUser(application, user.personId)) {
    return { message: "Adoption Application not found." };
  }

  // Check if the application status prevents modification
  const nonEditableStatuses: ApplicationStatus[] = [
    ApplicationStatus.REVIEWING,
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.ADOPTED,
  ];

  if (nonEditableStatuses.includes(application.status)) {
    return {
      message: `Cannot update application. Its status is currently "${application.status}". Applications cannot be modified if their status is REVIEWING, APPROVED, REJECTED, WITHDRAWN, or ADOPTED.`,
    };
  }

  // Validate form fields using Zod
  const validatedFields = MyAdoptionAppFormSchema.safeParse({
    applicantName: formData.get("applicantName"),
    applicantEmail: formData.get("applicantEmail"),
    applicantPhone: formData.get("applicantPhone"),
    applicantAddressLine1: formData.get("applicantAddressLine1"),
    applicantAddressLine2: formData.get("applicantAddressLine2"),
    applicantCity: formData.get("applicantCity"),
    applicantState: formData.get("applicantState"),
    applicantZipCode: formData.get("applicantZipCode"),
    livingSituation: formData.get("livingSituation"),
    hasYard: formData.get("hasYard"),
    landlordPermission: formData.get("landlordPermission"),
    householdSize: formData.get("householdSize"),
    hasChildren: formData.get("hasChildren"),
    childrenAges: formData.get("childrenAges"),
    otherAnimalsDescription: formData.get("otherAnimalsDescription"),
    animalExperience: formData.get("animalExperience"),
    reasonForAdoption: formData.get("reasonForAdoption"),
  });

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing Fields. Failed to Update Adoption Application.",
    };
  }

  // Prepare data for insertion into the database
  const {
    hasYard,
    landlordPermission,
    householdSize,
    hasChildren,
    childrenAges,
  } = validatedFields.data;

  const dataToUpdate = {
    ...validatedFields.data,
    hasYard: hasYard === "true", // Convert string "true" to boolean true
    landlordPermission: landlordPermission === "true", // Convert string "true" to boolean true
    householdSize: parseInt(householdSize, 10), // Convert string to number
    hasChildren: hasChildren === "true", // Convert string "true" to boolean true
    childrenAges:
      childrenAges.trim() === ""
        ? []
        : childrenAges.split(",").map((age) => parseInt(age.trim(), 10)), // Convert comma-separated string to number array
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
      message: "Database Error: Failed to Update Adoption Application.",
    };
  }

  // Revalidate relevant paths
  revalidatePath("/dashboard/my-applications");
  revalidatePath(`/dashboard/my-applications/${validatedApplicationId}`);

  // Redirect to the updated application's page
  redirect(`/dashboard/my-applications`);
};

const _withdrawMyApplication = async (
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
      select: { userId: true, status: true, animalId: true },
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

  revalidatePath(`/dashboard/my-applications/${validatedApplicationId}`);

  return { success: true, message: "Application withdrawn successfully." };
};

const _reactivateMyApplication = async (
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
        userId: true,
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
    await prisma.$transaction([
      // Update the application's current status
      prisma.adoptionApplication.update({
        where: { id: validatedApplicationId },
        data: { status: ApplicationStatus.PENDING },
      }),
      // Create the history record for the audit trail
      prisma.applicationStatusHistory.create({
        data: {
          applicationId: validatedApplicationId,
          status: ApplicationStatus.PENDING,
          statusChangeReason: "Application reactivated by user.",
          changedById: user.personId,
        },
      }),
    ]);
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

  revalidatePath("/dashboard/my-applications");

  return { success: true, message: "Application reactivated successfully." };
};

// Server action for the user to submit an application
const _createMyAdoptionApp = async (
  user: SessionUser, // Injected by withAuthenticatedUser
  animalId: string,
  prevState: MyAdoptionAppFormState,
  formData: FormData,
): Promise<MyAdoptionAppFormState> => {
  const parsedAnimalId = cuidSchema.safeParse(animalId);
  if (!parsedAnimalId.success) {
    return {
      message: "Invalid Animal ID format.",
    };
  }
  const validatedAnimalId = parsedAnimalId.data;

  // Validate form fields using Zod
  const validatedFields = MyAdoptionAppFormSchema.safeParse({
    applicantName: formData.get("applicantName"),
    applicantEmail: formData.get("applicantEmail"),
    applicantPhone: formData.get("applicantPhone"),
    applicantAddressLine1: formData.get("applicantAddressLine1"),
    applicantAddressLine2: formData.get("applicantAddressLine2"),
    applicantCity: formData.get("applicantCity"),
    applicantState: formData.get("applicantState"),
    applicantZipCode: formData.get("applicantZipCode"),
    livingSituation: formData.get("livingSituation"),
    hasYard: formData.get("hasYard"),
    landlordPermission: formData.get("landlordPermission"),
    householdSize: formData.get("householdSize"),
    hasChildren: formData.get("hasChildren"),
    childrenAges: formData.get("childrenAges"),
    otherAnimalsDescription: formData.get("otherAnimalsDescription"),
    animalExperience: formData.get("animalExperience"),
    reasonForAdoption: formData.get("reasonForAdoption"),
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing Fields. Failed to Submit Application.",
    };
  }

  const {
    hasYard,
    landlordPermission,
    householdSize,
    hasChildren,
    childrenAges,
    applicantName,
    applicantEmail,
    applicantPhone,
    applicantAddressLine1,
    applicantAddressLine2,
    applicantCity,
    applicantState,
    applicantZipCode,
    livingSituation,
    otherAnimalsDescription,
    animalExperience,
  } = validatedFields.data;

  const dataToCreate = {
    ...validatedFields.data,
    userId: user.personId,
    animalId: validatedAnimalId,
    hasYard: hasYard === "true",
    landlordPermission: landlordPermission === "true",
    householdSize: parseInt(householdSize, 10),
    hasChildren: hasChildren === "true",
    childrenAges:
      childrenAges.trim() === ""
        ? []
        : childrenAges.split(",").map((age) => parseInt(age.trim(), 10)),
  };

  const householdProfileData = {
    livingSituation,
    hasYard: dataToCreate.hasYard,
    landlordPermission: dataToCreate.landlordPermission,
    householdSize: dataToCreate.householdSize,
    hasChildren: dataToCreate.hasChildren,
    childrenAges: dataToCreate.childrenAges,
    otherAnimalsDescription,
    animalExperience,
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
      message:
        "Database Error: Failed to submit application. Please try again.",
    };
  }
  revalidatePath(`/pets/${validatedAnimalId}`);
  revalidatePath("/dashboard/my-applications");
  redirect("/dashboard/my-applications");
};

export const updateMyAdoptionApp = withAuthenticatedUser(_updateMyAdoptionApp);

export const withdrawMyApplication = withAuthenticatedUser(
  _withdrawMyApplication,
);

export const createMyAdoptionApp = withAuthenticatedUser(_createMyAdoptionApp);

export const reactivateMyApplication = withAuthenticatedUser(
  _reactivateMyApplication,
);
