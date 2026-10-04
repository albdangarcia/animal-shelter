import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { AnimalListingStatus, ApplicationStatus } from "@/prisma/generated/enums";
import { isOwnedByUser } from "@/app/lib/auth/ownership";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatus,
  effectiveStatusBehindLock,
  type DerivationApplicationRow,
} from "@/app/lib/data/application-status.data";
import { NON_WITHDRAWABLE_STATUSES } from "@/app/lib/utils/application-status";
import type { EffectiveApplicationStatus } from "@/app/lib/utils/derive-application-status";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";

/**
 * An applicant withdrawing their own adoption application, in two steps: a
 * friendly read that refuses early, then the write behind the animal lock,
 * which checks the status again. Withdrawing an approved application also
 * releases the animal it was holding back to the adoptable listings.
 *
 * Like `person-account-unlink`, this module has no `next/*` and no auth-chain
 * imports (`isOwnedByUser` is a plain predicate, and `auth/ownership` imports
 * only the Prisma client), so a plain `node:test` can drive it. Refusals are
 * thrown as `NotFoundError` or `ConflictError`; the caller turns them into
 * messages.
 */

export interface WithdrawableApplication {
  application: DerivationApplicationRow;
  /** The effective status the friendly read saw. */
  currentStatus: EffectiveApplicationStatus;
}

/**
 * The friendly read: the application has to be the person's own, and at a
 * status that can still be withdrawn. Runs outside any transaction, so what it
 * sees can change before `recordWithdrawal` writes.
 */
export const checkWithdrawal = async (
  applicationId: string,
  personId: string,
): Promise<WithdrawableApplication> => {
  const application = await prisma.adoptionApplication.findUnique({
    where: { id: applicationId },
    select: { applicantId: true, ...DERIVATION_APPLICATION_SELECT },
  });

  if (!isOwnedByUser(application, personId)) {
    throw new NotFoundError("Adoption Application not found.");
  }

  // What the application effectively is, not what the column holds.
  const currentStatus = await effectiveApplicationStatus(application);

  if (NON_WITHDRAWABLE_STATUSES.includes(currentStatus)) {
    throw new ConflictError(
      `Cannot withdraw application. Its status is currently "${formatSingleEnumOption(currentStatus)}".`,
    );
  }

  return { application, currentStatus };
};

/**
 * The write, inside the caller's `prisma.$transaction`: the status, its history
 * row, and for an approved application the release of the animal.
 */
export const recordWithdrawal = async (
  tx: TransactionClient,
  { application, currentStatus }: WithdrawableApplication,
  personId: string,
): Promise<void> => {
  // The read above only produces the friendly error. Behind the animal
  // lock no outcome can adopt or close the application before this
  // transaction writes.
  const statusNow = await effectiveStatusBehindLock(tx, application);
  if (!statusNow || NON_WITHDRAWABLE_STATUSES.includes(statusNow)) {
    throw new ConflictError(
      `Cannot withdraw application. Its status is currently "${formatSingleEnumOption(statusNow ?? currentStatus)}".`,
    );
  }

  // Update the application's status to WITHDRAWN
  await tx.adoptionApplication.update({
    where: { id: application.id },
    data: { status: ApplicationStatus.WITHDRAWN },
  });

  // Create the history record
  await tx.applicationStatusHistory.create({
    data: {
      applicationId: application.id,
      status: ApplicationStatus.WITHDRAWN,
      statusChangeReason: "Application withdrawn by user.",
      changedById: personId,
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
};
