"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationStatus,
  FosterPlacementType,
  FosterReturnReason,
  FosterStatus,
  OutcomeType,
} from "@prisma/client";
import { prisma } from "../prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import { FosterPlacementFormState } from "../form-state-types";
import {
  ConvertFosterToAdoptionSchema,
  CreateFosterPlacementSchema,
  ReturnFromFosterSchema,
} from "../zod-schemas/foster.schemas";
import { computeStays, type StayEvent } from "../utils/stay-utils";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";

const _createFosterPlacement = async (
  user: SessionUser,
  prevState: FosterPlacementFormState,
  formData: FormData,
): Promise<FosterPlacementFormState> => {
  const staffMemberId = user.personId;

  const validatedFields = CreateFosterPlacementSchema.safeParse({
    animalId: formData.get("animalId"),
    fosterProfileId: formData.get("fosterProfileId"),
    type: formData.get("type"),
    expectedEndDate: formData.get("expectedEndDate")
      ? new Date(formData.get("expectedEndDate") as string)
      : undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Missing or invalid fields. Failed to create foster placement.",
    };
  }

  const { animalId, fosterProfileId, type, expectedEndDate, notes } =
    validatedFields.data;

  try {
    // Serializable: the capacity/uniqueness checks below aren't expressible
    // as a single guarded row update (unlike return/convert's "must be
    // open" check), so isolate against concurrent placements the same way
    // createMyFosterApplication isolates its "one active application" check.
    await prisma.$transaction(
      async (tx) => {
        const fosterProfile = await tx.fosterProfile.findUnique({
          where: { id: fosterProfileId },
          select: {
            status: true,
            maxAnimals: true,
            person: { select: { name: true } },
            _count: { select: { placements: { where: { endDate: null } } } },
          },
        });

        if (!fosterProfile) {
          throw new NotFoundError("Foster profile not found.");
        }
        if (fosterProfile.status !== FosterStatus.ACTIVE) {
          throw new PreconditionFailedError(
            `Cannot place an animal with this foster: their profile status is ${fosterProfile.status.toLowerCase()}.`,
          );
        }
        if (fosterProfile._count.placements >= fosterProfile.maxAnimals) {
          throw new PreconditionFailedError(
            "This foster is already at capacity.",
          );
        }

        const animal = await tx.animal.findUnique({
          where: { id: animalId },
          select: {
            currentUnitId: true,
            listingStatus: true,
            intake: { select: { intakeDate: true } },
            Outcome: { select: { outcomeDate: true } },
            fosterPlacements: {
              where: { endDate: null },
              select: { id: true },
            },
          },
        });

        if (!animal) {
          throw new NotFoundError("Animal not found.");
        }
        if (animal.fosterPlacements.length > 0) {
          throw new ConflictError(
            "This animal already has an open foster placement.",
          );
        }

        const events: StayEvent[] = [
          ...animal.intake.map(
            (intake): StayEvent => ({
              kind: "intake",
              date: intake.intakeDate,
            }),
          ),
          ...animal.Outcome.map(
            (outcome): StayEvent => ({
              kind: "outcome",
              date: outcome.outcomeDate,
            }),
          ),
        ];
        if (!computeStays(events, new Date()).isInCare) {
          throw new PreconditionFailedError(
            "This animal is not currently in the shelter's care.",
          );
        }

        await tx.fosterPlacement.create({
          data: {
            type,
            expectedEndDate,
            animalId,
            fosterProfileId,
            previousUnitId: animal.currentUnitId,
            previousListingStatus:
              type === FosterPlacementType.FOSTER_TO_ADOPT
                ? animal.listingStatus
                : undefined,
            placedById: staffMemberId,
          },
        });

        await tx.animal.update({
          where: { id: animalId },
          data: {
            currentUnitId: null,
            ...(type === FosterPlacementType.FOSTER_TO_ADOPT && {
              listingStatus: AnimalListingStatus.PENDING_ADOPTION,
            }),
          },
        });

        await tx.animalActivityLog.create({
          data: {
            animalId,
            activityType: AnimalActivityType.FOSTER_PLACED,
            changedById: staffMemberId,
            changeSummary: `Placed with foster ${fosterProfile.person.name}.${
              notes ? ` ${notes}` : ""
            }`,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    console.error("Database error creating foster placement:", error);
    if (
      error instanceof NotFoundError ||
      error instanceof ConflictError ||
      error instanceof PreconditionFailedError
    ) {
      return { message: error.message };
    }
    return {
      message: "Database Error: Failed to create foster placement.",
    };
  }

  revalidatePath(`/dashboard/animals/${animalId}`);
  revalidatePath("/dashboard/fosters");
  revalidatePath("/dashboard/locations");
  redirect(`/dashboard/animals/${animalId}`);
};

export const createFosterPlacement = withAuthenticatedUser(
  RequirePermission(AppPermissions.FOSTERS_MANAGE)(_createFosterPlacement),
);

const _returnFromFoster = async (
  user: SessionUser,
  prevState: FosterPlacementFormState,
  formData: FormData,
): Promise<FosterPlacementFormState> => {
  const staffMemberId = user.personId;

  const validatedFields = ReturnFromFosterSchema.safeParse({
    placementId: formData.get("placementId"),
    returnReason: formData.get("returnReason"),
    returnNotes: formData.get("returnNotes") || undefined,
    unitId: formData.get("unitId"),
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message:
        "Missing or invalid fields. Failed to return animal from foster.",
    };
  }

  const { placementId, returnReason, returnNotes, unitId } =
    validatedFields.data;

  let animalId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const placement = await tx.fosterPlacement.findUnique({
        where: { id: placementId },
        select: {
          endDate: true,
          type: true,
          previousListingStatus: true,
          animalId: true,
          fosterProfile: { select: { person: { select: { name: true } } } },
        },
      });

      if (!placement) {
        throw new NotFoundError("Foster placement not found.");
      }
      if (placement.endDate !== null) {
        throw new ConflictError("This foster placement has already ended.");
      }

      const unit = await tx.unit.findFirst({
        where: { id: unitId, deletedAt: null },
        select: { id: true },
      });
      if (!unit) {
        throw new PreconditionFailedError(
          "That unit is no longer available. Please choose a different unit.",
        );
      }

      // Guarded update: the compare-and-swap on endDate is what makes this
      // race-safe against a concurrent return/conversion of the same
      // placement, without needing Serializable isolation.
      const updateResult = await tx.fosterPlacement.updateMany({
        where: { id: placementId, endDate: null },
        data: {
          endDate: new Date(),
          returnReason,
          returnNotes,
          returnedById: staffMemberId,
        },
      });
      if (updateResult.count === 0) {
        throw new ConflictError("This foster placement has already ended.");
      }

      await tx.animal.update({
        where: { id: placement.animalId },
        data: {
          currentUnitId: unitId,
          ...(placement.type === FosterPlacementType.FOSTER_TO_ADOPT &&
            placement.previousListingStatus && {
              listingStatus: placement.previousListingStatus,
            }),
        },
      });

      await tx.animalActivityLog.create({
        data: {
          animalId: placement.animalId,
          activityType: AnimalActivityType.FOSTER_RETURNED,
          changedById: staffMemberId,
          changeSummary: `Returned from foster ${placement.fosterProfile.person.name}.${
            returnNotes ? ` ${returnNotes}` : ""
          }`,
        },
      });

      return { animalId: placement.animalId };
    });
    animalId = result.animalId;
  } catch (error) {
    console.error("Database error returning animal from foster:", error);
    if (
      error instanceof NotFoundError ||
      error instanceof ConflictError ||
      error instanceof PreconditionFailedError
    ) {
      return { message: error.message };
    }
    return {
      message: "Database Error: Failed to return animal from foster.",
    };
  }

  revalidatePath(`/dashboard/animals/${animalId}`);
  revalidatePath("/dashboard/fosters");
  revalidatePath("/dashboard/locations");
  redirect(`/dashboard/animals/${animalId}`);
};

export const returnFromFoster = withAuthenticatedUser(
  RequirePermission(AppPermissions.FOSTERS_MANAGE)(_returnFromFoster),
);

// Convert (foster-to-adopt)

const _convertFosterToAdoption = async (
  user: SessionUser,
  prevState: FosterPlacementFormState,
  formData: FormData,
): Promise<FosterPlacementFormState> => {
  const staffMemberId = user.personId;

  const validatedFields = ConvertFosterToAdoptionSchema.safeParse({
    placementId: formData.get("placementId"),
    adoptionApplicationId: formData.get("adoptionApplicationId") || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message:
        "Missing or invalid fields. Failed to convert foster placement.",
    };
  }

  const { placementId, adoptionApplicationId } = validatedFields.data;

  let animalId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const placement = await tx.fosterPlacement.findUnique({
        where: { id: placementId },
        select: {
          endDate: true,
          type: true,
          animalId: true,
          fosterProfile: { select: { person: { select: { name: true } } } },
        },
      });

      if (!placement) {
        throw new NotFoundError("Foster placement not found.");
      }
      if (placement.endDate !== null) {
        throw new ConflictError("This foster placement has already ended.");
      }
      if (placement.type !== FosterPlacementType.FOSTER_TO_ADOPT) {
        throw new PreconditionFailedError(
          "Only foster-to-adopt placements can be converted here. Use the standard outcome flow to process an adoption for other placement types.",
        );
      }

      // Same ordering as outcome.actions.ts's createOutcome: archive the
      // animal first (guarded, mirroring its "already processed" check),
      // then validate the optional application, then create the outcome.
      const archiveResult = await tx.animal.updateMany({
        where: {
          id: placement.animalId,
          listingStatus: { not: AnimalListingStatus.ARCHIVED },
        },
        data: {
          listingStatus: AnimalListingStatus.ARCHIVED,
          archiveReason: OutcomeType.ADOPTION,
        },
      });
      if (archiveResult.count === 0) {
        throw new ConflictError(
          "This animal has already been processed for an outcome.",
        );
      }

      if (adoptionApplicationId) {
        const application = await tx.adoptionApplication.findUnique({
          where: { id: adoptionApplicationId },
          select: { status: true, animalId: true },
        });
        if (!application || application.animalId !== placement.animalId) {
          throw new PreconditionFailedError(
            "That adoption application does not belong to this animal.",
          );
        }
        if (application.status !== ApplicationStatus.APPROVED) {
          throw new PreconditionFailedError(
            "Cannot convert: the linked adoption application has not been approved.",
          );
        }
      }

      const outcome = await tx.outcome.create({
        data: {
          type: OutcomeType.ADOPTION,
          animal: { connect: { id: placement.animalId } },
          staffMember: { connect: { id: staffMemberId } },
          ...(adoptionApplicationId && {
            adoptionApplication: { connect: { id: adoptionApplicationId } },
          }),
        },
      });

      await tx.animalActivityLog.create({
        data: {
          animalId: placement.animalId,
          activityType: AnimalActivityType.OUTCOME_PROCESSED,
          changedById: staffMemberId,
          changeSummary: "Animal was processed for outcome: adoption.",
        },
      });

      if (adoptionApplicationId) {
        await tx.adoptionApplication.update({
          where: { id: adoptionApplicationId },
          data: { status: ApplicationStatus.ADOPTED },
        });
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: adoptionApplicationId,
            status: ApplicationStatus.ADOPTED,
            statusChangeReason: "Animal adopted by their foster.",
            changedById: staffMemberId,
          },
        });
      }

      // Reject any other still-open applications for this animal, same as
      // any other adoption outcome.
      const otherAppsToReject = await tx.adoptionApplication.findMany({
        where: {
          animalId: placement.animalId,
          id: { not: adoptionApplicationId },
          status: {
            in: [
              ApplicationStatus.PENDING,
              ApplicationStatus.REVIEWING,
              ApplicationStatus.WAITLISTED,
              ApplicationStatus.APPROVED,
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
        await tx.applicationStatusHistory.createMany({
          data: appIdsToReject.map((appId) => ({
            applicationId: appId,
            status: ApplicationStatus.REJECTED,
            statusChangeReason:
              "Application rejected as the animal is no longer available.",
            changedById: staffMemberId,
          })),
        });
      }

      // Guarded close, same compare-and-swap rationale as returnFromFoster.
      const updateResult = await tx.fosterPlacement.updateMany({
        where: { id: placementId, endDate: null },
        data: {
          endDate: new Date(),
          returnReason: FosterReturnReason.ADOPTED_BY_FOSTER,
          returnedById: staffMemberId,
          outcomeId: outcome.id,
          ...(adoptionApplicationId && { adoptionApplicationId }),
        },
      });
      if (updateResult.count === 0) {
        throw new ConflictError("This foster placement has already ended.");
      }

      await tx.animalActivityLog.create({
        data: {
          animalId: placement.animalId,
          activityType: AnimalActivityType.FOSTER_RETURNED,
          changedById: staffMemberId,
          changeSummary: `Foster-to-adopt placement with ${placement.fosterProfile.person.name} converted to an adoption.`,
        },
      });

      return { animalId: placement.animalId };
    });
    animalId = result.animalId;
  } catch (error) {
    console.error("Database error converting foster placement:", error);
    if (
      error instanceof NotFoundError ||
      error instanceof ConflictError ||
      error instanceof PreconditionFailedError
    ) {
      return { message: error.message };
    }
    return {
      message: "Database Error: Failed to convert foster placement.",
    };
  }

  revalidatePath(`/dashboard/animals/${animalId}`);
  revalidatePath("/dashboard/fosters");
  revalidatePath("/dashboard/locations");
  revalidatePath("/dashboard/outcomes");
  if (adoptionApplicationId) {
    revalidatePath("/dashboard/applications");
    revalidatePath(`/dashboard/applications/${adoptionApplicationId}`);
  }
  redirect(`/dashboard/animals/${animalId}`);
};

export const convertFosterToAdoption = withAuthenticatedUser(
  RequirePermission(AppPermissions.FOSTERS_MANAGE)(_convertFosterToAdoption),
);
