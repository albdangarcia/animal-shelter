"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../prisma";
import { StaffUpdateAppFormState, StaffAdoptionApplicationFormState } from "../form-state-types";
import { StaffUpdateAdoptionAppFormSchema, StaffAdoptionApplicationFormSchema } from "../zod-schemas/application.schemas";
import { MyAdoptionAppFormSchema } from "../zod-schemas/myApplication.schema";
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

const _staffCreateAdoptionApplication = async (
  personId: string,
  prevState: StaffAdoptionApplicationFormState,
  formData: FormData
): Promise<StaffAdoptionApplicationFormState> => {
  const session = await auth();
  if (!session?.user?.personId) {
    return {
      message:
        "Unauthorized: You must be logged in with a valid user profile to perform this action.",
    };
  }
  const currentPersonId = session.user.personId;

  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedPersonId.success) {
    return { message: "Invalid Person ID format." };
  }
  const validatedPersonId = parsedPersonId.data;

  // Block submission for persons who have a registered account — they submit via the public flow.
  let targetPerson;
  try {
    targetPerson = await prisma.person.findUnique({
      where: { id: validatedPersonId },
      select: { user: { select: { id: true } } },
    });
  } catch (error) {
    console.error("Database error fetching person:", error);
    return { message: "Database Error: Failed to verify person account status." };
  }
  if (!targetPerson) {
    return { message: "Person not found." };
  }
  if (targetPerson.user !== null) {
    return {
      message:
        "Cannot submit an application on behalf of a registered user. The person should submit their own application.",
    };
  }

  const validatedFields = StaffAdoptionApplicationFormSchema.safeParse({
    applicantName: formData.get("applicantName"),
    applicantEmail: formData.get("applicantEmail"),
    applicantPhone: formData.get("applicantPhone"),
    applicantAddressLine1: formData.get("applicantAddressLine1"),
    applicantAddressLine2: formData.get("applicantAddressLine2"),
    applicantCity: formData.get("applicantCity"),
    applicantState: formData.get("applicantState"),
    applicantZipCode: formData.get("applicantZipCode"),
    livingSituation: formData.get("livingSituation"),
    householdSize: formData.get("householdSize"),
    hasYard: formData.get("hasYard"),
    landlordPermission: formData.get("landlordPermission"),
    hasChildren: formData.get("hasChildren"),
    childrenAges: formData.get("childrenAges"),
    otherAnimalsDescription: formData.get("otherAnimalsDescription"),
    animalExperience: formData.get("animalExperience"),
    reasonForAdoption: formData.get("reasonForAdoption"),
    animalId: formData.get("animalId"),
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or Invalid Fields. Failed to Create Adoption Application.",
    };
  }

  const {
    animalId,
    applicantName,
    applicantEmail,
    applicantPhone,
    applicantAddressLine1,
    applicantAddressLine2,
    applicantCity,
    applicantState,
    applicantZipCode,
    livingSituation,
    householdSize,
    hasYard,
    landlordPermission,
    hasChildren,
    childrenAges,
    otherAnimalsDescription,
    animalExperience,
    reasonForAdoption,
  } = validatedFields.data;

  // Verify the target animal exists and is available for applications.
  let animal;
  try {
    animal = await prisma.animal.findUnique({
      where: { id: animalId },
      select: { listingStatus: true },
    });
  } catch (error) {
    console.error("Database error fetching animal:", error);
    return { message: "Database Error: Failed to verify animal availability." };
  }

  if (!animal || animal.listingStatus !== AnimalListingStatus.PUBLISHED) {
    return { message: "This animal is not available for adoption applications." };
  }

  // Prevent duplicate active applications for the same person + animal.
  let existingApp;
  try {
    existingApp = await prisma.adoptionApplication.findFirst({
      where: {
        applicantId: validatedPersonId,
        animalId,
        status: { notIn: [ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN] },
      },
      select: { id: true },
    });
  } catch (error) {
    console.error("Database error checking for duplicate application:", error);
    return { message: "Database Error: Failed to check for existing applications." };
  }

  if (existingApp) {
    return {
      message: "An active application already exists for this person and animal.",
    };
  }

  // Parse childrenAges from comma-separated string to Int[].
  const parsedChildrenAges =
    !childrenAges || childrenAges.trim() === ""
      ? []
      : childrenAges.split(",").map((age) => parseInt(age.trim(), 10));

  const hasYardBool = hasYard === undefined ? null : hasYard === "true";
  const landlordPermissionBool = landlordPermission === undefined ? null : landlordPermission === "true";
  const hasChildrenBool = hasChildren === undefined ? null : hasChildren === "true";
  const householdSizeInt = parseInt(householdSize, 10);

  const householdProfileData = {
    livingSituation,
    hasYard: hasYardBool,
    landlordPermission: landlordPermissionBool,
    householdSize: householdSizeInt,
    hasChildren: hasChildrenBool,
    childrenAges: parsedChildrenAges,
    otherAnimalsDescription: otherAnimalsDescription || null,
    animalExperience: animalExperience || null,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const newApplication = await tx.adoptionApplication.create({
        data: {
          applicantId: validatedPersonId,
          animalId,
          applicantName,
          applicantEmail,
          applicantPhone,
          applicantAddressLine1,
          applicantAddressLine2: applicantAddressLine2 || null,
          applicantCity,
          applicantState,
          applicantZipCode,
          livingSituation,
          hasYard: hasYardBool,
          landlordPermission: landlordPermissionBool,
          householdSize: householdSizeInt,
          hasChildren: hasChildrenBool,
          childrenAges: parsedChildrenAges,
          otherAnimalsDescription: otherAnimalsDescription || null,
          animalExperience: animalExperience || null,
          reasonForAdoption,
          status: ApplicationStatus.PENDING,
        },
        select: { id: true },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: newApplication.id,
          status: ApplicationStatus.PENDING,
          statusChangeReason: "Application submitted by staff on behalf of applicant.",
          changedById: currentPersonId,
        },
      });

      // Unlike _updateStaffHouseholdProfile (Task 03) which blocks edits for registered users,
      // here we always upsert because the H&L data was captured verbally during the application
      // intake. The "Add Application" flow is only accessible via the staff dashboard, so this
      // is acceptable behavior.
      await tx.householdProfile.upsert({
        where: { personId: validatedPersonId },
        create: { personId: validatedPersonId, ...householdProfileData },
        update: householdProfileData,
      });
    });
  } catch (error) {
    console.error("Database Error during staff create application transaction:", error);
    return {
      message: "Database Error: Failed to create adoption application.",
    };
  }

  revalidatePath(
    `/dashboard/people-directory/${validatedPersonId}/adoption-applications`
  );
  redirect(
    `/dashboard/people-directory/${validatedPersonId}/adoption-applications`
  );
};

export const staffCreateAdoptionApplication = RequirePermission(
  AppPermissions.PERSONS_MANAGE
)(_staffCreateAdoptionApplication);

const _staffEditPersonApplication = async (
  applicationId: string,
  personId: string,
  callbackUrl: string | null,
  prevState: StaffAdoptionApplicationFormState,
  formData: FormData
): Promise<StaffAdoptionApplicationFormState> => {
  const session = await auth();
  if (!session?.user?.personId) {
    return {
      message:
        "Unauthorized: You must be logged in with a valid user profile to perform this action.",
    };
  }

  const parsedAppId = cuidSchema.safeParse(applicationId);
  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedAppId.success || !parsedPersonId.success) {
    return { message: "Invalid ID format." };
  }
  const validatedAppId = parsedAppId.data;
  const validatedPersonId = parsedPersonId.data;

  // Block edits for persons who have a registered account.
  let targetPerson;
  try {
    targetPerson = await prisma.person.findUnique({
      where: { id: validatedPersonId },
      select: { user: { select: { id: true } } },
    });
  } catch (error) {
    console.error("Database error fetching person:", error);
    return { message: "Database Error: Failed to verify person account status." };
  }
  if (!targetPerson) return { message: "Person not found." };
  if (targetPerson.user !== null) {
    return {
      message:
        "Cannot edit an application belonging to a registered user. The person should manage their own application.",
    };
  }

  // Verify the application exists and belongs to this person.
  let existingApplication;
  try {
    existingApplication = await prisma.adoptionApplication.findUnique({
      where: { id: validatedAppId, applicantId: validatedPersonId },
      select: { id: true },
    });
  } catch (error) {
    console.error("Database error fetching application:", error);
    return { message: "Database Error: Failed to retrieve application." };
  }
  if (!existingApplication) {
    return { message: "Application not found." };
  }

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
    householdSize: formData.get("householdSize"),
    hasYard: formData.get("hasYard"),
    landlordPermission: formData.get("landlordPermission"),
    hasChildren: formData.get("hasChildren"),
    childrenAges: formData.get("childrenAges"),
    otherAnimalsDescription: formData.get("otherAnimalsDescription"),
    animalExperience: formData.get("animalExperience"),
    reasonForAdoption: formData.get("reasonForAdoption"),
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or Invalid Fields. Failed to Update Application.",
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
    livingSituation,
    householdSize,
    hasYard,
    landlordPermission,
    hasChildren,
    childrenAges,
    otherAnimalsDescription,
    animalExperience,
    reasonForAdoption,
  } = validatedFields.data;

  const parsedChildrenAges =
    !childrenAges || childrenAges.trim() === ""
      ? []
      : childrenAges.split(",").map((age) => parseInt(age.trim(), 10));

  const hasYardBool = hasYard === undefined ? null : hasYard === "true";
  const landlordPermissionBool = landlordPermission === undefined ? null : landlordPermission === "true";
  const hasChildrenBool = hasChildren === undefined ? null : hasChildren === "true";
  const householdSizeInt = parseInt(householdSize, 10);

  const householdProfileData = {
    livingSituation,
    hasYard: hasYardBool,
    landlordPermission: landlordPermissionBool,
    householdSize: householdSizeInt,
    hasChildren: hasChildrenBool,
    childrenAges: parsedChildrenAges,
    otherAnimalsDescription: otherAnimalsDescription || null,
    animalExperience: animalExperience || null,
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.adoptionApplication.update({
        where: { id: validatedAppId },
        data: {
          applicantName,
          applicantEmail,
          applicantPhone,
          applicantAddressLine1,
          applicantAddressLine2: applicantAddressLine2 || null,
          applicantCity,
          applicantState,
          applicantZipCode,
          livingSituation,
          hasYard: hasYardBool,
          landlordPermission: landlordPermissionBool,
          householdSize: householdSizeInt,
          hasChildren: hasChildrenBool,
          childrenAges: parsedChildrenAges,
          otherAnimalsDescription: otherAnimalsDescription || null,
          animalExperience: animalExperience || null,
          reasonForAdoption,
        },
      });

      await tx.householdProfile.upsert({
        where: { personId: validatedPersonId },
        create: { personId: validatedPersonId, ...householdProfileData },
        update: householdProfileData,
      });
    });
  } catch (error) {
    console.error("Database Error during staff edit application transaction:", error);
    return { message: "Database Error: Failed to update application." };
  }

  revalidatePath("/dashboard/adoption-applications");
  revalidatePath(
    `/dashboard/people-directory/${validatedPersonId}/adoption-applications`
  );

  // Redirect to callbackUrl if it's a safe relative path, otherwise fall back.
  const destination =
    callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : `/dashboard/people-directory/${validatedPersonId}/adoption-applications`;

  redirect(destination);
};

export const staffEditPersonApplication = RequirePermission(
  AppPermissions.PERSONS_MANAGE
)(_staffEditPersonApplication);
