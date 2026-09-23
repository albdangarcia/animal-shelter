"use server";

import { getShelterToday } from "@/app/lib/data/shelter-settings.data";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AnimalActivityType,
  AnimalListingStatus,
  ApplicationStatus,
  FosterPlacementType,
  FosterReturnReason,
  FosterStatus,
  OutcomeType,
} from "@/prisma/generated/enums";
import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "../auth/permissions";
import {
  ConvertFosterToAdoptionSchema,
  createFosterPlacementSchema,
  type CreateFosterPlacementSchema,
  ReturnFromFosterSchema,
} from "../zod-schemas/foster.schemas";
import { computeStays, type StayEvent } from "../utils/stay-utils";
import { calendarDay } from "../utils/shelter-day";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatus,
  lockAnimal,
} from "../data/application-status.data";
import { assertNoLiveAdoptionOutcome } from "../services/outcome-reversal";

const ADOPTION_APPLICATIONS_PATH = "/dashboard/adoption-applications";

type CreateFosterPlacementInput = z.input<CreateFosterPlacementSchema>;
type ReturnFromFosterInput = z.input<typeof ReturnFromFosterSchema>;
type ConvertFosterToAdoptionInput = z.input<
  typeof ConvertFosterToAdoptionSchema
>;

const _createFosterPlacement = async (
  user: SessionUser,
  values: CreateFosterPlacementInput,
): Promise<FormResult<CreateFosterPlacementInput>> => {
  const staffMemberId = user.personId;

  // One resolved day for the whole action: it rejects a return date already in
  // the past, dates the placement's start, and decides whether the animal is in
  // care. Only the server can resolve it, so this is the check that decides —
  // the browser's is a convenience.
  const today = await getShelterToday();

  const validatedFields = createFosterPlacementSchema(today).safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message: "Missing or invalid fields. Failed to create foster placement.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<CreateFosterPlacementInput>,
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
              date: calendarDay(intake.intakeDate),
            }),
          ),
          ...animal.Outcome.map(
            (outcome): StayEvent => ({
              kind: "outcome",
              date: calendarDay(outcome.outcomeDate),
            }),
          ),
        ];
        if (!computeStays(events, today).isInCare) {
          throw new PreconditionFailedError(
            "This animal is not currently in the shelter's care.",
          );
        }

        await tx.fosterPlacement.create({
          data: {
            type,
            startDate: today,
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
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: "Database Error: Failed to create foster placement.",
    };
  }

  revalidatePath(`/dashboard/animals/${animalId}`);
  revalidatePath("/dashboard/fosters");
  revalidatePath("/dashboard/locations");
  return {
    ok: true,
    message: "Placement created.",
    redirectTo: `/dashboard/animals/${animalId}`,
  };
};

export const createFosterPlacement = withAuthenticatedUser(
  RequirePermission(AppPermissions.FOSTERS_MANAGE)(_createFosterPlacement),
);

const _returnFromFoster = async (
  user: SessionUser,
  values: ReturnFromFosterInput,
): Promise<FormResult<ReturnFromFosterInput>> => {
  const staffMemberId = user.personId;

  const validatedFields = ReturnFromFosterSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message:
        "Missing or invalid fields. Failed to return animal from foster.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<ReturnFromFosterInput>,
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
          endDate: await getShelterToday(),
          returnReason,
          // Nullable column: a cleared textarea submits "" from the client,
          // which should read back as "no notes" rather than an empty string.
          returnNotes: returnNotes?.trim() ? returnNotes : null,
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
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: "Database Error: Failed to return animal from foster.",
    };
  }

  revalidatePath(`/dashboard/animals/${animalId}`);
  revalidatePath("/dashboard/fosters");
  revalidatePath("/dashboard/locations");
  return {
    ok: true,
    message: "Animal returned from foster.",
    redirectTo: `/dashboard/animals/${animalId}`,
  };
};

export const returnFromFoster = withAuthenticatedUser(
  RequirePermission(AppPermissions.FOSTERS_MANAGE)(_returnFromFoster),
);

// Convert (foster-to-adopt)

const _convertFosterToAdoption = async (
  user: SessionUser,
  values: ConvertFosterToAdoptionInput,
): Promise<FormResult<ConvertFosterToAdoptionInput>> => {
  const staffMemberId = user.personId;

  const validatedFields = ConvertFosterToAdoptionSchema.safeParse(values);

  if (!validatedFields.success) {
    return {
      ok: false,
      message:
        "Missing or invalid fields. Failed to convert foster placement.",
      fieldErrors: z.flattenError(validatedFields.error)
        .fieldErrors as FieldErrors<ConvertFosterToAdoptionInput>,
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
          fosterProfile: {
            select: { person: { select: { id: true, name: true } } },
          },
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

      // Same ordering as outcome.actions.ts's createOutcome: lock the animal
      // and read the listing status the outcome stores for a reversal to
      // restore, archive the animal (guarded, mirroring its "already
      // processed" check), then validate the optional application, then
      // create the outcome.
      await lockAnimal(tx, placement.animalId);
      const animal = await tx.animal.findUnique({
        where: { id: placement.animalId },
        select: { listingStatus: true },
      });
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
      if (!animal || archiveResult.count === 0) {
        throw new ConflictError(
          "This animal has already been processed for an outcome.",
        );
      }

      if (adoptionApplicationId) {
        const application = await tx.adoptionApplication.findUnique({
          where: { id: adoptionApplicationId },
          select: { ...DERIVATION_APPLICATION_SELECT, applicantId: true },
        });
        if (!application || application.animalId !== placement.animalId) {
          throw new PreconditionFailedError(
            "That adoption application does not belong to this animal.",
          );
        }
        // This is the foster's own conversion, so the application has to be
        // theirs — nothing else names an adopter for this outcome, the way a
        // standard adoption outcome's adopter is always its linked
        // application's applicant. Without this, any approved application for
        // the animal (another applicant's) could be linked here and credited
        // to the wrong person.
        if (application.applicantId !== placement.fosterProfile.person.id) {
          throw new PreconditionFailedError(
            "That adoption application does not belong to this foster.",
          );
        }
        await assertNoLiveAdoptionOutcome(tx, application.id);
        // Effective, not the column, for the same reason as createOutcome:
        // an application an earlier stay's outcome adopted or closed still
        // stores APPROVED.
        if (
          (await effectiveApplicationStatus(application, tx)) !==
          ApplicationStatus.APPROVED
        ) {
          throw new PreconditionFailedError(
            "Cannot convert: the linked adoption application has not been approved.",
          );
        }
      }

      const outcome = await tx.outcome.create({
        data: {
          type: OutcomeType.ADOPTION,
          // The conversion happens now, so the adoption is dated today on the
          // shelter's calendar. Nothing in the placement records the day the
          // foster decided, and inventing one from its dates would be a guess.
          outcomeDate: await getShelterToday(),
          previousListingStatus: animal.listingStatus,
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

      // Nothing is written onto the applications, the same as any other
      // adoption outcome: the linked one now reads as adopted and every other
      // application still open on the animal as closed, both derived from
      // this outcome. None of them was rejected; nobody assessed them.

      // Guarded close, same compare-and-swap rationale as returnFromFoster.
      const updateResult = await tx.fosterPlacement.updateMany({
        where: { id: placementId, endDate: null },
        data: {
          endDate: await getShelterToday(),
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
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: "Database Error: Failed to convert foster placement.",
    };
  }

  revalidatePath(`/dashboard/animals/${animalId}`);
  revalidatePath("/dashboard/fosters");
  revalidatePath("/dashboard/locations");
  revalidatePath("/dashboard/outcomes");
  if (adoptionApplicationId) {
    revalidatePath(ADOPTION_APPLICATIONS_PATH);
    revalidatePath(
      `${ADOPTION_APPLICATIONS_PATH}/${adoptionApplicationId}/edit`,
    );
  }
  return {
    ok: true,
    message: "Foster placement converted to adoption.",
    redirectTo: `/dashboard/animals/${animalId}`,
  };
};

export const convertFosterToAdoption = withAuthenticatedUser(
  RequirePermission(AppPermissions.FOSTERS_MANAGE)(_convertFosterToAdoption),
);
