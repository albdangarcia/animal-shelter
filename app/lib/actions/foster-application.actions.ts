"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ApplicationStatus, FosterStatus } from "@/prisma/generated/enums";
import { Prisma } from "@/prisma/generated/client";
import prisma from "@/app/lib/prisma";
import {
  FosterApplicationFormState,
  FosterProfileFormState,
  FosterStatusChangeFormState,
} from "../form-state-types";
import {
  CreateFosterProfileSchema,
  FosterApplicationFormSchema,
  FosterApplicationStatusChangeSchema,
  FosterCapabilityFieldsSchema,
} from "../zod-schemas/foster.schemas";
import { cuidSchema } from "../zod-schemas/common.schemas";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import { ActionResult } from "../types";
import {
  isAllowedTransition,
  illegalTransitionMessage,
} from "../utils/application-status";

// Non-terminal statuses block a new application from being submitted, mirroring
// the "one active adoption application" convention (ADOPTED is never used here).
const nonTerminalFosterStatuses: ApplicationStatus[] = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
];

const terminalFosterStatuses: ApplicationStatus[] = [
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.REJECTED,
];

const _createMyFosterApplication = async (
  user: SessionUser,
  prevState: FosterApplicationFormState,
  formData: FormData,
): Promise<FosterApplicationFormState> => {
  // Array field must be pulled with getAll — Object.fromEntries keeps only
  // the last value for repeated keys.
  const speciesIds = formData.getAll("speciesIds");

  const validatedFields = FosterApplicationFormSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    speciesIds,
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to submit foster application.",
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
    hasYard,
    landlordPermission,
    householdSize,
    hasChildren,
    childrenAges,
    otherAnimalsDescription,
    animalExperience,
    speciesIds: validatedSpeciesIds,
    maxAnimals,
    hasQuarantineSpace,
    canGiveOralMeds,
    canBottleFeed,
    canTransport,
    acceptsMedical,
    acceptsHospice,
    availabilityNotes,
  } = validatedFields.data;

  const householdProfileData = {
    livingSituation,
    hasYard: hasYard === undefined ? undefined : hasYard === "true",
    landlordPermission:
      landlordPermission === undefined
        ? undefined
        : landlordPermission === "true",
    householdSize: parseInt(householdSize, 10),
    hasChildren:
      hasChildren === undefined ? undefined : hasChildren === "true",
    childrenAges:
      !childrenAges || childrenAges.trim() === ""
        ? []
        : childrenAges.split(",").map((age) => parseInt(age.trim(), 10)),
    otherAnimalsDescription,
    animalExperience,
  };

  const dataToCreate = {
    applicantName,
    applicantEmail,
    applicantPhone,
    applicantAddressLine1,
    applicantAddressLine2,
    applicantCity,
    applicantState,
    applicantZipCode,
    ...householdProfileData,
    maxAnimals: parseInt(maxAnimals, 10),
    hasQuarantineSpace:
      hasQuarantineSpace === undefined
        ? undefined
        : hasQuarantineSpace === "true",
    canGiveOralMeds:
      canGiveOralMeds === undefined ? undefined : canGiveOralMeds === "true",
    canBottleFeed:
      canBottleFeed === undefined ? undefined : canBottleFeed === "true",
    canTransport:
      canTransport === undefined ? undefined : canTransport === "true",
    acceptsMedical:
      acceptsMedical === undefined ? undefined : acceptsMedical === "true",
    acceptsHospice:
      acceptsHospice === undefined ? undefined : acceptsHospice === "true",
    availabilityNotes,
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.fosterApplication.findFirst({
          where: {
            personId: user.personId,
            status: { in: nonTerminalFosterStatuses },
          },
          select: { id: true },
        });

        if (existing) {
          throw new Error("EXISTING_APPLICATION");
        }

        await tx.fosterApplication.create({
          data: {
            ...dataToCreate,
            personId: user.personId,
            speciesCapabilities:
              validatedSpeciesIds.length > 0
                ? { connect: validatedSpeciesIds.map((id) => ({ id })) }
                : undefined,
            history: {
              create: {
                status: ApplicationStatus.PENDING,
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
      { isolationLevel: "Serializable" },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "EXISTING_APPLICATION") {
      return {
        message:
          "You already have a foster application in progress. Please wait for it to be reviewed, or withdraw it before applying again.",
      };
    }
    console.error("Error submitting foster application:", error);
    return {
      message:
        "Database Error: Failed to submit application. Please try again.",
    };
  }

  revalidatePath("/dashboard/my-foster-application");
  return { success: true, message: "Foster application submitted successfully." };
};

const _withdrawMyFosterApplication = async (
  user: SessionUser,
  applicationId: string,
): Promise<ActionResult> => {
  const parsedApplicationId = cuidSchema.safeParse(applicationId);
  if (!parsedApplicationId.success) {
    return { success: false, message: "Invalid foster application ID format." };
  }
  const validatedApplicationId = parsedApplicationId.data;

  let application;
  try {
    application = await prisma.fosterApplication.findUnique({
      where: { id: validatedApplicationId },
      select: { personId: true, status: true },
    });
  } catch (error) {
    console.error(
      "Error verifying foster application ownership for withdrawal:",
      error,
    );
    return {
      success: false,
      message:
        "A server error occurred while verifying the application. Please try again.",
    };
  }

  if (!application || application.personId !== user.personId) {
    return { success: false, message: "Foster application not found." };
  }

  if (terminalFosterStatuses.includes(application.status)) {
    return {
      success: false,
      message: `Cannot withdraw application. Its status is currently "${application.status}".`,
    };
  }

  try {
    await prisma.$transaction([
      prisma.fosterApplication.update({
        where: { id: validatedApplicationId },
        data: { status: ApplicationStatus.WITHDRAWN },
      }),
      prisma.fosterApplicationStatusHistory.create({
        data: {
          applicationId: validatedApplicationId,
          status: ApplicationStatus.WITHDRAWN,
          statusChangeReason: "Application withdrawn by user.",
          changedById: user.personId,
        },
      }),
    ]);
  } catch (error) {
    console.error(
      `Database Error withdrawing foster application ${validatedApplicationId}:`,
      error,
    );
    return {
      success: false,
      message: "Database Error: Failed to withdraw foster application.",
    };
  }

  revalidatePath("/dashboard/my-foster-application");
  return { success: true, message: "Foster application withdrawn successfully." };
};

export const createMyFosterApplication = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_FOSTER_APPLICATION_MANAGE)(
    _createMyFosterApplication,
  ),
);

export const withdrawMyFosterApplication = withAuthenticatedUser(
  RequirePermission(AppPermissions.MY_FOSTER_APPLICATION_MANAGE)(
    _withdrawMyFosterApplication,
  ),
);

// Staff review

const _updateFosterApplicationStatus = async (
  user: SessionUser,
  prevState: FosterStatusChangeFormState,
  formData: FormData,
): Promise<FosterStatusChangeFormState> => {
  const validatedFields = FosterApplicationStatusChangeSchema.safeParse({
    applicationId: formData.get("applicationId"),
    status: formData.get("status"),
    statusChangeReason: formData.get("statusChangeReason"),
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message:
        "Missing or invalid fields. Failed to update foster application.",
    };
  }

  const { applicationId, status, statusChangeReason } = validatedFields.data;

  let existingApplication;
  try {
    existingApplication = await prisma.fosterApplication.findUnique({
      where: { id: applicationId },
      select: {
        personId: true,
        status: true,
        maxAnimals: true,
        hasQuarantineSpace: true,
        canGiveOralMeds: true,
        canBottleFeed: true,
        canTransport: true,
        acceptsMedical: true,
        acceptsHospice: true,
        availabilityNotes: true,
        speciesCapabilities: { select: { id: true } },
      },
    });
  } catch (error) {
    console.error("Database error fetching foster application:", error);
    return {
      message: "Database Error: Failed to retrieve application details.",
    };
  }

  if (!existingApplication) {
    return { message: "Foster application not found." };
  }

  if (
    status !== existingApplication.status &&
    !isAllowedTransition(existingApplication.status, status)
  ) {
    return {
      message: illegalTransitionMessage(existingApplication.status, status),
    };
  }

  // Reassigned to a const so the narrowed (non-null) type survives into the
  // transaction closure below.
  const application = existingApplication;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.fosterApplication.update({
        where: { id: applicationId },
        data: { status },
      });

      await tx.fosterApplicationStatusHistory.create({
        data: {
          applicationId,
          status,
          statusChangeReason,
          changedById: user.personId,
        },
      });

      // Approval creates/activates the FosterProfile from the application's
      // capability snapshot. Upsert so a previously INACTIVE
      // foster can be re-approved.
      if (status === ApplicationStatus.APPROVED) {
        const speciesConnect = application.speciesCapabilities.map((s) => ({
          id: s.id,
        }));

        const capabilityData = {
          maxAnimals: application.maxAnimals,
          hasQuarantineSpace: application.hasQuarantineSpace,
          canGiveOralMeds: application.canGiveOralMeds,
          canBottleFeed: application.canBottleFeed,
          canTransport: application.canTransport,
          acceptsMedical: application.acceptsMedical,
          acceptsHospice: application.acceptsHospice,
          availabilityNotes: application.availabilityNotes,
        };

        await tx.fosterProfile.upsert({
          where: { personId: application.personId },
          create: {
            personId: application.personId,
            status: FosterStatus.ACTIVE,
            approvedAt: new Date(),
            ...capabilityData,
            speciesCapabilities: { connect: speciesConnect },
          },
          update: {
            status: FosterStatus.ACTIVE,
            approvedAt: new Date(),
            ...capabilityData,
            speciesCapabilities: { set: speciesConnect },
          },
        });
      }
    });
  } catch (error) {
    console.error(
      `Database Error updating foster application ${applicationId}:`,
      error,
    );
    return {
      message: "Database Error: Failed to update foster application.",
    };
  }

  revalidatePath("/dashboard/foster-applications");
  revalidatePath(`/dashboard/foster-applications/${applicationId}`);
  revalidatePath("/dashboard/fosters");

  return {
    success: true,
    message: "Foster application updated successfully.",
  };
};

export const updateFosterApplicationStatus = withAuthenticatedUser(
  RequirePermission(AppPermissions.FOSTERS_MANAGE)(
    _updateFosterApplicationStatus,
  ),
);

// ─── Direct add (pressure valve for walk-ins/emergencies) ──────────────────

const _createFosterProfileDirect = async (
  prevState: FosterProfileFormState,
  formData: FormData,
): Promise<FosterProfileFormState> => {
  const speciesIds = formData.getAll("speciesIds");

  const validatedFields = CreateFosterProfileSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    speciesIds,
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create foster profile.",
    };
  }

  const {
    personId,
    speciesIds: validatedSpeciesIds,
    maxAnimals,
    hasQuarantineSpace,
    canGiveOralMeds,
    canBottleFeed,
    canTransport,
    acceptsMedical,
    acceptsHospice,
    availabilityNotes,
  } = validatedFields.data;

  let existingProfile;
  try {
    existingProfile = await prisma.fosterProfile.findUnique({
      where: { personId },
      select: { id: true },
    });
  } catch (error) {
    console.error(
      "Database error checking for existing foster profile:",
      error,
    );
    return {
      message: "Database Error: Failed to verify existing foster profile.",
    };
  }

  if (existingProfile) {
    return {
      message:
        "This person already has a foster profile. Manage their status from the existing profile instead.",
    };
  }

  try {
    await prisma.fosterProfile.create({
      data: {
        personId,
        status: FosterStatus.ACTIVE,
        approvedAt: new Date(),
        maxAnimals: parseInt(maxAnimals, 10),
        hasQuarantineSpace:
          hasQuarantineSpace === undefined
            ? undefined
            : hasQuarantineSpace === "true",
        canGiveOralMeds:
          canGiveOralMeds === undefined
            ? undefined
            : canGiveOralMeds === "true",
        canBottleFeed:
          canBottleFeed === undefined ? undefined : canBottleFeed === "true",
        canTransport:
          canTransport === undefined ? undefined : canTransport === "true",
        acceptsMedical:
          acceptsMedical === undefined ? undefined : acceptsMedical === "true",
        acceptsHospice:
          acceptsHospice === undefined ? undefined : acceptsHospice === "true",
        availabilityNotes,
        speciesCapabilities:
          validatedSpeciesIds.length > 0
            ? { connect: validatedSpeciesIds.map((id) => ({ id })) }
            : undefined,
      },
    });
  } catch (error) {
    console.error("Database Error creating foster profile:", error);
    return { message: "Database Error: Failed to create foster profile." };
  }

  revalidatePath("/dashboard/fosters");
  redirect("/dashboard/fosters");
};

export const createFosterProfileDirect = RequirePermission(
  AppPermissions.FOSTERS_MANAGE,
)(_createFosterProfileDirect);

// ─── Profile status & capability management (Fostering tab) ────────────────

const _updateFosterProfileStatus = async (
  fosterProfileId: string,
  status: FosterStatus,
): Promise<ActionResult> => {
  const parsedId = cuidSchema.safeParse(fosterProfileId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid foster profile ID format." };
  }

  let profile;
  try {
    profile = await prisma.fosterProfile.findUnique({
      where: { id: parsedId.data },
      select: {
        personId: true,
        _count: { select: { placements: { where: { endDate: null } } } },
      },
    });
  } catch (error) {
    console.error(
      "Database error fetching foster profile for status change:",
      error,
    );
    return {
      success: false,
      message: "A server error occurred. Please try again.",
    };
  }

  if (!profile) {
    return { success: false, message: "Foster profile not found." };
  }

  // Deactivate is blocked while a placement is open; Pause is not — it only
  // blocks *new* placements (enforced by createFosterPlacement itself).
  if (status === FosterStatus.INACTIVE && profile._count.placements > 0) {
    return {
      success: false,
      message:
        "Cannot deactivate this foster while they have an open placement. Return the animal(s) first.",
    };
  }

  try {
    await prisma.fosterProfile.update({
      where: { id: parsedId.data },
      data: { status },
    });
  } catch (error) {
    console.error("Database Error updating foster profile status:", error);
    return {
      success: false,
      message: "Database Error: Failed to update foster status.",
    };
  }

  revalidatePath(`/dashboard/people-directory/${profile.personId}/fostering`);
  revalidatePath("/dashboard/fosters");
  return { success: true, message: "Foster status updated." };
};

export const updateFosterProfileStatus = RequirePermission(
  AppPermissions.FOSTERS_MANAGE,
)(_updateFosterProfileStatus);

const _updateFosterProfileCapabilities = async (
  fosterProfileId: string,
  prevState: FosterProfileFormState,
  formData: FormData,
): Promise<FosterProfileFormState> => {
  const parsedId = cuidSchema.safeParse(fosterProfileId);
  if (!parsedId.success) {
    return { message: "Invalid foster profile ID format." };
  }

  const speciesIds = formData.getAll("speciesIds");

  const validatedFields = FosterCapabilityFieldsSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    speciesIds,
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to update foster capabilities.",
    };
  }

  const {
    speciesIds: validatedSpeciesIds,
    maxAnimals,
    hasQuarantineSpace,
    canGiveOralMeds,
    canBottleFeed,
    canTransport,
    acceptsMedical,
    acceptsHospice,
    availabilityNotes,
  } = validatedFields.data;

  let profile;
  try {
    profile = await prisma.fosterProfile.update({
      where: { id: parsedId.data },
      data: {
        maxAnimals: parseInt(maxAnimals, 10),
        hasQuarantineSpace:
          hasQuarantineSpace === undefined
            ? undefined
            : hasQuarantineSpace === "true",
        canGiveOralMeds:
          canGiveOralMeds === undefined
            ? undefined
            : canGiveOralMeds === "true",
        canBottleFeed:
          canBottleFeed === undefined ? undefined : canBottleFeed === "true",
        canTransport:
          canTransport === undefined ? undefined : canTransport === "true",
        acceptsMedical:
          acceptsMedical === undefined ? undefined : acceptsMedical === "true",
        acceptsHospice:
          acceptsHospice === undefined ? undefined : acceptsHospice === "true",
        availabilityNotes,
        speciesCapabilities: { set: validatedSpeciesIds.map((id) => ({ id })) },
      },
      select: { personId: true },
    });
  } catch (error) {
    console.error(
      "Database Error updating foster profile capabilities:",
      error,
    );
    return {
      message: "Database Error: Failed to update foster capabilities.",
    };
  }

  revalidatePath(`/dashboard/people-directory/${profile.personId}/fostering`);
  revalidatePath("/dashboard/fosters");
  return { success: true, message: "Foster capabilities updated." };
};

export const updateFosterProfileCapabilities = RequirePermission(
  AppPermissions.FOSTERS_MANAGE,
)(_updateFosterProfileCapabilities);
