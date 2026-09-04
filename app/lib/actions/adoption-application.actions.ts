"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import {
  StaffUpdateAdoptionAppFormSchema,
  StaffAdoptionApplicationFormSchema,
  type StaffAdoptionApplicationFormInput,
  type StaffUpdateAdoptionAppFormInput,
} from "../zod-schemas/application.schemas";
import {
  MyAdoptionAppFormSchema,
  toAdoptionApplicantData,
  type MyAdoptionAppFormInput,
} from "../zod-schemas/myAdoptionApplication.schema";
import { toHouseholdData } from "../zod-schemas/household-profile.schemas";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { ApplicationStatus, AnimalListingStatus } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import { getCachedSession } from "@/app/lib/auth/session";
import { ConflictError } from "../utils/errors";
import { safeInternalPath } from "../utils/safe-redirect";
import {
  isAllowedTransition,
  illegalTransitionMessage,
} from "../utils/application-status";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

const ADOPTION_APPLICATIONS_PATH = "/dashboard/adoption-applications";

const personApplicationsPath = (personId: string) =>
  `/dashboard/people-directory/${personId}/adoption-applications`;

const _staffUpdateAdoptionApp = async (
  adoptionAppId: string,
  values: StaffUpdateAdoptionAppFormInput
): Promise<FormResult<StaffUpdateAdoptionAppFormInput>> => {
  const session = await getCachedSession();
  if (!session?.user?.personId) {
    return {
      ok: false,
      message:
        "Unauthorized: You must be logged in with a valid user profile to perform this action.",
    };
  }
  const currentPersonId = session.user.personId;

  const parsedAdoptionAppId = cuidSchema.safeParse(adoptionAppId);
  if (!parsedAdoptionAppId.success) {
    return { ok: false, message: "Invalid Adoption Application ID format." };
  }
  const validatedAdoptionAppId = parsedAdoptionAppId.data;

  let existingApplication;
  try {
    existingApplication = await prisma.adoptionApplication.findUnique({
      where: { id: validatedAdoptionAppId },
      select: { status: true, animalId: true },
    });
    if (!existingApplication) {
      return { ok: false, message: "Adoption Application not found." };
    }
  } catch (error) {
    console.error("Database error fetching existing application:", error);
    return {
      ok: false,
      message: "Database Error: Failed to retrieve application details.",
    };
  }

  const validatedFields = StaffUpdateAdoptionAppFormSchema.safeParse(values);

  if (!validatedFields.success) {
    console.error(
      "Validation error in staff update adoption application:",
      validatedFields.error
    );
    return {
      ok: false,
      message:
        "Missing or Invalid Fields. Failed to Update Adoption Application.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<StaffUpdateAdoptionAppFormInput>,
    };
  }

  const {
    status: newStatus,
    internalNotes,
    statusChangeReason,
  } = validatedFields.data;

  const isStatusActuallyChanging =
    newStatus !== undefined && newStatus !== existingApplication.status;

  if (
    isStatusActuallyChanging &&
    !isAllowedTransition(existingApplication.status, newStatus)
  ) {
    return {
      ok: false,
      message: illegalTransitionMessage(existingApplication.status, newStatus),
    };
  }

  if (isStatusActuallyChanging) {
    const isExemptedChange =
      existingApplication.status === ApplicationStatus.PENDING &&
      newStatus === ApplicationStatus.REVIEWING;
    if (
      !isExemptedChange &&
      (!statusChangeReason || statusChangeReason.trim() === "")
    ) {
      return {
        ok: false,
        message:
          "Validation Error: A reason for the status change is required.",
        fieldErrors: {
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
    return {
      ok: false,
      message: "No changes provided to update the application.",
    };
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
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message:
        "Database Error: Failed to Update Adoption Application and associated records.",
    };
  }

  revalidatePath(ADOPTION_APPLICATIONS_PATH);
  revalidatePath(`${ADOPTION_APPLICATIONS_PATH}/${validatedAdoptionAppId}/edit`);

  return {
    ok: true,
    message: "Application updated successfully.",
    redirectTo: ADOPTION_APPLICATIONS_PATH,
  };
};

export const staffUpdateAdoptionApp = RequirePermission(
  AppPermissions.APPLICATIONS_MANAGE_STATUS
)(_staffUpdateAdoptionApp);

const _staffCreateAdoptionApplication = async (
  personId: string,
  values: StaffAdoptionApplicationFormInput
): Promise<FormResult<StaffAdoptionApplicationFormInput>> => {
  const session = await getCachedSession();
  if (!session?.user?.personId) {
    return {
      ok: false,
      message:
        "Unauthorized: You must be logged in with a valid user profile to perform this action.",
    };
  }
  const currentPersonId = session.user.personId;

  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedPersonId.success) {
    return { ok: false, message: "Invalid Person ID format." };
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
    return {
      ok: false,
      message: "Database Error: Failed to verify person account status.",
    };
  }
  if (!targetPerson) {
    return { ok: false, message: "Person not found." };
  }
  if (targetPerson.user !== null) {
    return {
      ok: false,
      message:
        "Cannot submit an application on behalf of a registered user. The person should submit their own application.",
    };
  }

  const validatedFields =
    StaffAdoptionApplicationFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or Invalid Fields. Failed to Create Adoption Application.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<StaffAdoptionApplicationFormInput>,
    };
  }

  const { animalId } = validatedFields.data;

  // Verify the target animal exists and is available for applications.
  let animal;
  try {
    animal = await prisma.animal.findUnique({
      where: { id: animalId },
      select: { listingStatus: true },
    });
  } catch (error) {
    console.error("Database error fetching animal:", error);
    return {
      ok: false,
      message: "Database Error: Failed to verify animal availability.",
    };
  }

  if (!animal || animal.listingStatus !== AnimalListingStatus.PUBLISHED) {
    return {
      ok: false,
      message: "This animal is not available for adoption applications.",
    };
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
    return {
      ok: false,
      message: "Database Error: Failed to check for existing applications.",
    };
  }

  if (existingApp) {
    return {
      ok: false,
      message: "An active application already exists for this person and animal.",
    };
  }

  // Same shared mappers the public flow uses, so a staff-entered application
  // and a self-service one produce identical columns — including
  // landlordPermission being null rather than false for non-renters.
  const householdProfileData = toHouseholdData(validatedFields.data);

  try {
    await prisma.$transaction(async (tx) => {
      const newApplication = await tx.adoptionApplication.create({
        data: {
          applicantId: validatedPersonId,
          animalId,
          ...toAdoptionApplicantData(validatedFields.data),
          ...householdProfileData,
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

      // Unlike _updateStaffHouseholdProfile which blocks edits for registered users,
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
      ok: false,
      message: "Database Error: Failed to create adoption application.",
    };
  }

  revalidatePath(personApplicationsPath(validatedPersonId));

  return {
    ok: true,
    message: "Application submitted successfully.",
    redirectTo: personApplicationsPath(validatedPersonId),
  };
};

export const staffCreateAdoptionApplication = RequirePermission(
  AppPermissions.PERSONS_MANAGE
)(_staffCreateAdoptionApplication);

const _staffEditPersonApplication = async (
  applicationId: string,
  personId: string,
  callbackUrl: string | null,
  values: MyAdoptionAppFormInput
): Promise<FormResult<MyAdoptionAppFormInput>> => {
  const session = await getCachedSession();
  if (!session?.user?.personId) {
    return {
      ok: false,
      message:
        "Unauthorized: You must be logged in with a valid user profile to perform this action.",
    };
  }

  const parsedAppId = cuidSchema.safeParse(applicationId);
  const parsedPersonId = cuidSchema.safeParse(personId);
  if (!parsedAppId.success || !parsedPersonId.success) {
    return { ok: false, message: "Invalid ID format." };
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
    return {
      ok: false,
      message: "Database Error: Failed to verify person account status.",
    };
  }
  if (!targetPerson) return { ok: false, message: "Person not found." };
  if (targetPerson.user !== null) {
    return {
      ok: false,
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
    return {
      ok: false,
      message: "Database Error: Failed to retrieve application.",
    };
  }
  if (!existingApplication) {
    return { ok: false, message: "Application not found." };
  }

  const validatedFields = MyAdoptionAppFormSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or Invalid Fields. Failed to Update Application.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<MyAdoptionAppFormInput>,
    };
  }

  const householdProfileData = toHouseholdData(validatedFields.data);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.adoptionApplication.update({
        where: { id: validatedAppId },
        data: {
          ...toAdoptionApplicantData(validatedFields.data),
          ...householdProfileData,
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
    return { ok: false, message: "Database Error: Failed to update application." };
  }

  revalidatePath(ADOPTION_APPLICATIONS_PATH);
  revalidatePath(personApplicationsPath(validatedPersonId));

  // Navigate to callbackUrl if it's a safe relative path, otherwise fall back.
  // Still validated here rather than trusted from the client: the form passes
  // it through, but this action is reachable by direct POST.
  const destination = safeInternalPath(
    callbackUrl,
    personApplicationsPath(validatedPersonId)
  );

  return {
    ok: true,
    message: "Application updated successfully.",
    redirectTo: destination,
  };
};

export const staffEditPersonApplication = RequirePermission(
  AppPermissions.PERSONS_MANAGE
)(_staffEditPersonApplication);
