"use server";

import { revalidatePath } from "next/cache";
import prisma, { type TransactionClient } from "@/app/lib/prisma";
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
import {
  householdEditStamp,
  toHouseholdData,
} from "../zod-schemas/household-profile.schemas";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { RequirePermission } from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  ApplicationSource,
  ApplicationStatus,
  AnimalListingStatus,
} from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import { getCachedSession } from "@/app/lib/auth/session";
import { ConflictError } from "../utils/errors";
import { safeInternalPath } from "../utils/safe-redirect";
import {
  ACTIVE_APPLICATION_STATUSES,
  isAllowedTransition,
  illegalTransitionMessage,
  STAFF_EDITABLE_STATUSES,
} from "../utils/application-status";
import { formatSingleEnumOption } from "../utils/enum-formatter";
import type { EffectiveApplicationStatus } from "../utils/derive-application-status";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatus,
  effectiveApplicationStatuses,
  effectiveStatusBehindLock,
  lockAnimal,
  lockPerson,
} from "../data/application-status.data";
import { z } from "zod";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";

const ADOPTION_APPLICATIONS_PATH = "/dashboard/adoption-applications";

const personApplicationsPath = (personId: string) =>
  `/dashboard/people-directory/${personId}/adoption-applications`;

const DUPLICATE_APPLICATION_MESSAGE =
  "An active application already exists for this person and animal.";

// Whether this person already has an application for this animal that a new
// one would duplicate. Decided on each application's effective status, which
// the column cannot answer: an application an outcome closed stores an open
// status underneath, and is not active. Pass the transaction client, behind
// the animal lock, for the check that counts.
const hasActiveApplication = async (
  db: Pick<TransactionClient, "adoptionApplication" | "outcome">,
  personId: string,
  animalId: string,
) => {
  const applications = await db.adoptionApplication.findMany({
    where: { applicantId: personId, animalId },
    select: DERIVATION_APPLICATION_SELECT,
  });
  const statuses = await effectiveApplicationStatuses(applications, db);
  return [...statuses.values()].some((status) =>
    ACTIVE_APPLICATION_STATUSES.includes(status),
  );
};

const _staffUpdateAdoptionApp = async (
  adoptionAppId: string,
  returnTo: string | null,
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
  // What the application is, not what the column holds: an application the
  // animal's outcome has adopted or closed has no transitions, whatever review
  // decision sits underneath it.
  let currentStatus: EffectiveApplicationStatus;
  try {
    existingApplication = await prisma.adoptionApplication.findUnique({
      where: { id: validatedAdoptionAppId },
      select: DERIVATION_APPLICATION_SELECT,
    });
    if (!existingApplication) {
      return { ok: false, message: "Adoption Application not found." };
    }
    currentStatus = await effectiveApplicationStatus(existingApplication);
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
    newStatus !== undefined && newStatus !== currentStatus;

  if (
    isStatusActuallyChanging &&
    !isAllowedTransition(currentStatus, newStatus)
  ) {
    return {
      ok: false,
      message: illegalTransitionMessage(currentStatus, newStatus),
    };
  }

  if (isStatusActuallyChanging) {
    const isExemptedChange =
      currentStatus === ApplicationStatus.PENDING &&
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
      // The checks above ran on a status read before this transaction. Read it
      // again behind the animal lock: an outcome recorded in between would
      // have adopted or closed the application, and so would a second
      // reviewer's change. Either way the decision was made on a stale screen.
      const statusNow = await effectiveStatusBehindLock(tx, existingApplication);
      if (statusNow === null) {
        throw new ConflictError("Adoption Application not found.");
      }
      if (statusNow !== currentStatus) {
        throw new ConflictError(
          `This application is now ${formatSingleEnumOption(statusNow).toLowerCase()}. Reload it and review again.`,
        );
      }

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
          currentStatus === ApplicationStatus.APPROVED &&
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
  revalidatePath(`${ADOPTION_APPLICATIONS_PATH}/${validatedAdoptionAppId}/review`);

  return {
    ok: true,
    message: "Application updated successfully.",
    redirectTo: safeInternalPath(returnTo, ADOPTION_APPLICATIONS_PATH),
  };
};

export const staffUpdateAdoptionApp = RequirePermission(
  AppPermissions.APPLICATIONS_MANAGE_STATUS
)(_staffUpdateAdoptionApp);

const _staffCreateAdoptionApplication = async (
  personId: string,
  returnTo: string | null,
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

  // No account check. Someone who has an account can file this themselves, but
  // walking in and giving the answers at the desk is still how a lot of them
  // arrive, and refusing on the existence of an account would leave staff able
  // to correct an application they may not enter — which is backwards. The
  // duplicate gate below is what stops the same application existing twice.
  let targetPerson;
  try {
    targetPerson = await prisma.person.findUnique({
      where: { id: validatedPersonId },
      select: { id: true },
    });
  } catch (error) {
    console.error("Database error fetching person:", error);
    return {
      ok: false,
      message: "Database Error: Failed to verify the person record.",
    };
  }
  if (!targetPerson) {
    return { ok: false, message: "Person not found." };
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

  // Prevent duplicate active applications for the same person + animal. Staff
  // may enter a new one over a rejected or withdrawn application (see
  // STAFF_OVERRIDABLE_APPLICATION_STATUSES), so this reads the active list
  // rather than the applicant's stricter blocking one. Repeated inside the
  // transaction below, which is where the rule is actually enforced.
  let hasDuplicate;
  try {
    hasDuplicate = await hasActiveApplication(
      prisma,
      validatedPersonId,
      animalId,
    );
  } catch (error) {
    console.error("Database error checking for duplicate application:", error);
    return {
      ok: false,
      message: "Database Error: Failed to check for existing applications.",
    };
  }

  if (hasDuplicate) {
    return { ok: false, message: DUPLICATE_APPLICATION_MESSAGE };
  }

  // Same shared mappers the public flow uses, so a staff-entered application
  // and a self-service one produce identical columns — including
  // landlordPermission being null rather than false for non-renters.
  const householdProfileData = toHouseholdData(validatedFields.data);

  try {
    await prisma.$transaction(async (tx) => {
      // The read above gives the friendly error; the check behind this lock
      // is the guarantee.
      await lockPerson(tx, validatedPersonId);

      // The animal too, so an outcome cannot be recorded between the checks
      // below and the create: the animal would be gone, and an application
      // that outcome had closed could otherwise still read as active.
      await lockAnimal(tx, animalId);

      // Re-read behind the locks: the reads before the transaction are only
      // the friendly error path. Without this, two submissions for the same
      // person and animal both pass the earlier check, then queue on the lock
      // and both create an application.
      const lockedAnimal = await tx.animal.findUnique({
        where: { id: animalId },
        select: { listingStatus: true },
      });
      if (lockedAnimal?.listingStatus !== AnimalListingStatus.PUBLISHED) {
        throw new ConflictError(
          "This animal is not available for adoption applications.",
        );
      }
      if (await hasActiveApplication(tx, validatedPersonId, animalId)) {
        throw new ConflictError(DUPLICATE_APPLICATION_MESSAGE);
      }

      const newApplication = await tx.adoptionApplication.create({
        data: {
          applicantId: validatedPersonId,
          animalId,
          ...toAdoptionApplicantData(validatedFields.data),
          ...householdProfileData,
          status: ApplicationStatus.PENDING,
          // This snapshot was transcribed at intake rather than typed by the
          // applicant, so it is the one more likely to hold a mishearing.
          // Never a permission rule — the applicant may still correct it once
          // they have an account.
          source: ApplicationSource.STAFF,
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

      // The household answers were captured at the desk alongside the rest of
      // the application, so the profile is brought in line with them in the
      // same transaction — the snapshot and the profile would otherwise
      // disagree about a household the shelter just wrote down.
      const editStamp = householdEditStamp(currentPersonId);
      await tx.householdProfile.upsert({
        where: { personId: validatedPersonId },
        create: { personId: validatedPersonId, ...householdProfileData, ...editStamp },
        update: { ...householdProfileData, ...editStamp },
      });
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      return { ok: false, message: error.message };
    }
    console.error("Database Error during staff create application transaction:", error);
    return {
      ok: false,
      message: "Database Error: Failed to create adoption application.",
    };
  }

  revalidatePath(personApplicationsPath(validatedPersonId));
  revalidatePath(ADOPTION_APPLICATIONS_PATH);

  return {
    ok: true,
    message: "Application submitted successfully.",
    redirectTo: safeInternalPath(
      returnTo,
      personApplicationsPath(validatedPersonId)
    ),
  };
};

export const staffCreateAdoptionApplication = RequirePermission(
  AppPermissions.PERSONS_MANAGE
)(_staffCreateAdoptionApplication);

const _staffEditPersonApplication = async (
  applicationId: string,
  personId: string,
  returnTo: string | null,
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

  // No account check. An applicant who has signed up is still the person whose
  // answers these are, and staff are still the only ones who can correct a
  // snapshot they transcribed at intake — most of all for someone who can no
  // longer reach the account. Refusing on the existence of an account left
  // that application correctable by nobody. What makes this safe is not a
  // lock but the record: `lastEditedBy` / `lastEditedAt` below say who moved
  // the text, on the reviewer's screen and on the applicant's own.

  // Verify the application exists and belongs to this person.
  let existingApplication;
  let currentStatus: EffectiveApplicationStatus | undefined;
  try {
    existingApplication = await prisma.adoptionApplication.findUnique({
      where: { id: validatedAppId, applicantId: validatedPersonId },
      select: DERIVATION_APPLICATION_SELECT,
    });
    if (existingApplication) {
      currentStatus = await effectiveApplicationStatus(existingApplication);
    }
  } catch (error) {
    console.error("Database error fetching application:", error);
    return {
      ok: false,
      message: "Database Error: Failed to retrieve application.",
    };
  }
  if (!existingApplication || !currentStatus) {
    return { ok: false, message: "Application not found." };
  }
  if (!STAFF_EDITABLE_STATUSES.includes(currentStatus)) {
    return {
      ok: false,
      message: `Cannot edit ${formatSingleEnumOption(currentStatus).toLowerCase()} applications.`,
    };
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
      // The read above only produces the friendly error. Behind the animal
      // lock no outcome can adopt or close the application before this
      // transaction writes.
      const statusNow = await effectiveStatusBehindLock(tx, existingApplication);
      if (!statusNow || !STAFF_EDITABLE_STATUSES.includes(statusNow)) {
        throw new ConflictError(
          "This application has moved to a status staff cannot edit.",
        );
      }

      // Unconditional on the status: everything that changes it — a review
      // decision, a withdrawal, a reactivation — takes the animal lock too, so
      // the status just derived is still the status at this write.
      const { count } = await tx.adoptionApplication.updateMany({
        where: {
          id: validatedAppId,
          applicantId: validatedPersonId,
        },
        data: {
          ...toAdoptionApplicantData(validatedFields.data),
          ...householdProfileData,
          // The other of the two snapshot-edit paths. Recorded here for the
          // same reason as on the applicant's own edit: a reviewer needs to
          // know the text moved after they read it, and `updatedAt` also moves
          // for a status change.
          lastEditedById: session.user.personId,
          lastEditedAt: new Date(),
        },
      });
      if (count === 0) {
        throw new ConflictError("Application not found.");
      }

      const editStamp = householdEditStamp(session.user.personId);
      await tx.householdProfile.upsert({
        where: { personId: validatedPersonId },
        create: { personId: validatedPersonId, ...householdProfileData, ...editStamp },
        update: { ...householdProfileData, ...editStamp },
      });
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      return { ok: false, message: error.message };
    }
    console.error("Database Error during staff edit application transaction:", error);
    return { ok: false, message: "Database Error: Failed to update application." };
  }

  revalidatePath(ADOPTION_APPLICATIONS_PATH);
  revalidatePath(personApplicationsPath(validatedPersonId));

  // Navigate to returnTo if it's a safe relative path, otherwise fall back.
  // Still validated here rather than trusted from the client: the form passes
  // it through, but this action is reachable by direct POST.
  const destination = safeInternalPath(
    returnTo,
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
