"use server";

import { cuidSchema } from "../zod-schemas/common.schemas";
import prisma from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  AnimalListingStatus,
  ApplicationSource,
  ApplicationStatus,
} from "@/prisma/generated/enums";
import {
  APPLICANT_EDITABLE_STATUSES,
  BLOCKING_APPLICATION_STATUSES,
  REACTIVATION_BLOCKING_STATUSES,
  formatStatusList,
} from "../utils/application-status";
import { ConflictError } from "../utils/errors";
import { formatSingleEnumOption } from "../utils/enum-formatter";
import {
  deriveApplicationStatus,
  EffectiveApplicationStatus,
  toDerivationOutcome,
} from "../utils/derive-application-status";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatus,
  effectiveApplicationStatuses,
  effectiveStatusBehindLock,
  lockAnimal,
  lockPerson,
} from "../data/application-status.data";
import {
  MyAdoptionAppFormSchema,
  toAdoptionApplicantData,
  type MyAdoptionAppFormInput,
} from "../zod-schemas/myAdoptionApplication.schema";
import {
  householdEditStamp,
  toHouseholdData,
} from "../zod-schemas/household-profile.schemas";
import { SessionUser, withAuthenticatedUser } from "../auth/protected-actions";
import { ActionResult } from "../types";
import { z } from "zod";
import { isOwnedByUser } from "../auth/ownership";
import { syncPersonToUser } from "../services/user-person-sync";
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
      select: { applicantId: true, ...DERIVATION_APPLICATION_SELECT },
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

  // What the application effectively is, not what the column holds: an
  // outcome recorded for the animal after this was submitted can have closed
  // or adopted it without moving the column.
  const currentStatus = await effectiveApplicationStatus(application);

  // Allow-list, not a deny-list: a status added to the enum stays
  // non-editable here until it is added to APPLICANT_EDITABLE_STATUSES.
  if (!APPLICANT_EDITABLE_STATUSES.includes(currentStatus)) {
    return {
      ok: false,
      message: `Cannot update application. Its status is currently "${formatSingleEnumOption(currentStatus)}". Only ${formatStatusList(APPLICANT_EDITABLE_STATUSES)} applications can be modified.`,
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
  //
  // `lastEditedBy`/`lastEditedAt` ride along with them because this is one of
  // the only two paths that rewrites the snapshot. `updatedAt` cannot say this:
  // a status change or an internal-notes edit bumps that too, so a reviewer
  // reading it has no way to tell whether the text in front of them moved after
  // they read it.
  const dataToUpdate = {
    ...toAdoptionApplicantData(validatedFields.data),
    ...toHouseholdData(validatedFields.data),
    lastEditedById: user.personId,
    lastEditedAt: new Date(),
  };

  // The reads above only produce the friendly error. Behind the animal lock
  // no outcome can adopt or close the application, and no other writer can
  // move it, before this transaction writes — an outcome recorded on this
  // animal, and a staff review decision, both take the same lock.
  try {
    await prisma.$transaction(async (tx) => {
      const statusNow = await effectiveStatusBehindLock(tx, application);
      if (!statusNow || !APPLICANT_EDITABLE_STATUSES.includes(statusNow)) {
        throw new ConflictError(
          "This application can no longer be edited. Its status changed while you were editing it.",
        );
      }

      // Unconditional on the status, the same as the staff edit action:
      // everything that changes it takes the animal lock too.
      const { count } = await tx.adoptionApplication.updateMany({
        where: {
          id: validatedApplicationId,
          applicantId: user.personId,
        },
        data: dataToUpdate,
      });
      if (count === 0) {
        throw new ConflictError("Adoption Application not found.");
      }
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      return { ok: false, message: error.message };
    }
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
      select: { applicantId: true, ...DERIVATION_APPLICATION_SELECT },
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

  const nonWithdrawableStatuses: EffectiveApplicationStatus[] = [
    EffectiveApplicationStatus.ADOPTED,
    EffectiveApplicationStatus.WITHDRAWN,
    EffectiveApplicationStatus.REJECTED,
    // Nothing left to withdraw from: the animal has already left the shelter.
    EffectiveApplicationStatus.CLOSED,
  ];

  // What the application effectively is, not what the column holds.
  const currentStatus = await effectiveApplicationStatus(application);

  if (nonWithdrawableStatuses.includes(currentStatus)) {
    return {
      success: false,
      message: `Cannot withdraw application. Its status is currently "${formatSingleEnumOption(currentStatus)}".`,
    };
  }

  // Update the application status and create a history record
  try {
    await prisma.$transaction(async (tx) => {
      // The read above only produces the friendly error. Behind the animal
      // lock no outcome can adopt or close the application before this
      // transaction writes.
      const statusNow = await effectiveStatusBehindLock(tx, application);
      if (!statusNow || nonWithdrawableStatuses.includes(statusNow)) {
        throw new ConflictError(
          `Cannot withdraw application. Its status is currently "${formatSingleEnumOption(statusNow ?? currentStatus)}".`,
        );
      }

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

      if (statusNow === ApplicationStatus.APPROVED) {
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
    if (error instanceof ConflictError) {
      return { success: false, message: error.message };
    }
    console.error(
      `Database Error withdrawing adoption application ${validatedApplicationId}:`,
      error,
    );
    return {
      success: false,
      message: "Database Error: Failed to withdraw Adoption Application.",
    };
  }

  // The list, the read-only view page both actions can now be invoked from,
  // and the edit route the status change closes off.
  revalidatePath(MY_APPLICATIONS_PATH);
  revalidatePath(`${MY_APPLICATIONS_PATH}/${validatedApplicationId}`);
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
        ...DERIVATION_APPLICATION_SELECT,
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
      message: `Cannot reactivate application. Its status is currently "${formatSingleEnumOption(application.status)}".`,
    };
  }

  // Update the application status to PENDING and create a history record
  try {
    await prisma.$transaction(
      async (tx) => {
        // Behind the animal lock, so an outcome recorded on this animal
        // between the read above and this write cannot be missed.
        await lockAnimal(tx, application.animalId);

        // The reads above only produce the friendly errors. Re-read both
        // behind the lock: a second reactivation, a staff review decision, or
        // a listing change can all land between that read and here, and the
        // unconditional write below would otherwise reactivate an application
        // that has since moved, or one whose animal is no longer available.
        const current = await tx.adoptionApplication.findUnique({
          where: { id: validatedApplicationId },
          select: { status: true, animal: { select: { listingStatus: true } } },
        });
        if (!current) {
          throw new ConflictError("Adoption Application not found.");
        }
        if (current.animal.listingStatus !== "PUBLISHED") {
          throw new ConflictError(
            "Cannot reactivate application. This animal is no longer available for adoption.",
          );
        }
        if (current.status !== ApplicationStatus.WITHDRAWN) {
          throw new ConflictError(
            `Cannot reactivate application. Its status is currently "${formatSingleEnumOption(current.status)}".`,
          );
        }

        // Reactivating writes PENDING, and PENDING is not a settled review
        // decision, so if an outcome was recorded for this animal after this
        // application was submitted, the derivation would call the freshly
        // reactivated application CLOSED the instant this transaction
        // commits — the same outcome that would have closed it had it still
        // been open. Checked hypothetically, against what the write is about
        // to make the review status, rather than against the derivation of
        // the row as it stands now (WITHDRAWN, which is itself settled and
        // would never read as closed).
        const outcomes = await tx.outcome.findMany({
          where: { animalId: application.animalId },
          select: {
            createdAt: true,
            type: true,
            adoptionApplicationId: true,
            reversedAt: true,
          },
        });
        const statusIfReactivated = deriveApplicationStatus(
          {
            id: application.id,
            reviewStatus: ApplicationStatus.PENDING,
            submittedAt: application.submittedAt,
          },
          outcomes.map(toDerivationOutcome),
        );
        if (statusIfReactivated === EffectiveApplicationStatus.CLOSED) {
          throw new ConflictError(
            "Cannot reactivate application. This animal is no longer available for adoption.",
          );
        }

        // Reviving this application must not leave the person with two live
        // ones for the same animal, and must not walk them back out of a
        // rejection they could not re-apply past (see
        // REACTIVATION_BLOCKING_STATUSES). Staff can enter a fresh application
        // over a withdrawn one before the person has an account, and both then
        // arrive in "My Applications" together; nothing else stops the
        // withdrawn one being reactivated alongside its replacement. Derived,
        // behind the animal lock just taken, rather than read off the column:
        // a sibling application the column still calls open may already be
        // CLOSED, which does not block, or ADOPTED, which does.
        const siblings = await tx.adoptionApplication.findMany({
          where: {
            applicantId: user.personId,
            animalId: application.animalId,
            id: { not: validatedApplicationId },
          },
          select: DERIVATION_APPLICATION_SELECT,
        });
        const siblingStatuses = await effectiveApplicationStatuses(
          siblings,
          tx,
        );
        const blocker = siblings.find((sibling) =>
          REACTIVATION_BLOCKING_STATUSES.includes(
            siblingStatuses.get(sibling.id)!,
          ),
        );
        if (blocker) {
          throw new ConflictError(
            siblingStatuses.get(blocker.id) === ApplicationStatus.REJECTED
              ? "Cannot reactivate application. A previous application for this animal was not approved."
              : "Cannot reactivate application. You already have an active application for this animal.",
          );
        }

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
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof ConflictError) {
      return { success: false, message: error.message };
    }
    console.error(
      `Database Error reactivating adoption application ${validatedApplicationId}:`,
      error,
    );
    return {
      success: false,
      message: "Database Error: Failed to reactivate Adoption Application.",
    };
  }

  revalidatePath(MY_APPLICATIONS_PATH);
  revalidatePath(`${MY_APPLICATIONS_PATH}/${validatedApplicationId}`);

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

  // No `applicantEmail`: it belongs to the application snapshot (the shared
  // mapper puts it there) and deliberately never reaches the Person sync below.
  const {
    applicantName,
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
    source: ApplicationSource.SELF,
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        // Person, then animal — the lock order every writer that takes both
        // follows (see `lockAnimal`), because this transaction also updates
        // the person's row below. Staff create takes them in this order too;
        // taking animal first here would deadlock against it. An outcome
        // recorded on this animal between the read that hid the apply form
        // and this write must be seen, so the animal lock is still taken
        // before either check below reads anything.
        await lockPerson(tx, user.personId);
        await lockAnimal(tx, validatedAnimalId);

        const animal = await tx.animal.findUnique({
          where: { id: validatedAnimalId },
          select: { listingStatus: true },
        });

        if (animal?.listingStatus !== "PUBLISHED") {
          throw new Error("This animal is no longer available for adoption.");
        }

        // The apply page hides the form from someone who already has an
        // application for this animal, but this action is reachable without
        // going through that page: from a form left open in another tab, or by
        // a direct POST. Checked here, behind the animal lock just taken, so
        // two submissions cannot both pass it. Derived rather than read off
        // the column: a prior application the column still calls open may
        // already be CLOSED, which does not block re-applying.
        const existingApplications = await tx.adoptionApplication.findMany({
          where: {
            applicantId: user.personId,
            animalId: validatedAnimalId,
          },
          select: DERIVATION_APPLICATION_SELECT,
        });
        const existingStatuses = await effectiveApplicationStatuses(
          existingApplications,
          tx,
        );
        if (
          [...existingStatuses.values()].some((status) =>
            BLOCKING_APPLICATION_STATUSES.includes(status),
          )
        ) {
          throw new ConflictError(
            "You already have an application for this animal.",
          );
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
        const editStamp = householdEditStamp(user.personId);
        await tx.householdProfile.upsert({
          where: { personId: user.personId },
          create: { personId: user.personId, ...householdProfileData, ...editStamp },
          update: { ...householdProfileData, ...editStamp },
        });

        // Sync the contact details back onto Person, so the shelter's record
        // reflects what the applicant last told it.
        //
        // Every column here except one. The email the applicant types is the
        // contact address *for this application* and stays on the application
        // snapshot, which is what a reviewer reads. It deliberately does not
        // become the email of record, because the email of record is also the
        // address the account signs in under: most accounts here arrive
        // through a provider, so moving it would repoint the login — and cost
        // the account its verified status — from a form that looks nothing
        // like account settings. Someone changing the address the shelter
        // holds for them does it on their profile, where that is the stated
        // purpose of the page.
        //
        // Leaving it out is also what keeps this transaction safe. `email` is
        // the only one of these columns behind a unique index, so it was the
        // only one that could collide with another record; a statement that
        // fails inside a Postgres transaction aborts the whole transaction,
        // which would have taken the application and the household profile
        // down with a contact-detail sync.
        await tx.person.update({
          where: { id: user.personId },
          data: {
            name: applicantName,
            phone: applicantPhone,
            address: applicantAddressLine2
              ? `${applicantAddressLine1}, ${applicantAddressLine2}`
              : applicantAddressLine1,
            city: applicantCity,
            state: applicantState,
            zipCode: applicantZipCode,
          },
        });

        // The name still has to reach `User`: it is denormalized there and the
        // row above just moved it. No `email` key, so the login address is
        // left exactly as it was.
        await syncPersonToUser(tx, user.personId, { name: applicantName });
      },
      {
        isolationLevel: "Serializable",
      },
    );
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      return { ok: false, message: error.message };
    }
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
