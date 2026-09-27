"use server";

import { getShelterToday } from "@/app/lib/data/shelter-settings.data";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AnimalActivityType,
  AnimalListingStatus,
  FosterPlacementType,
  FosterStatus,
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
  TimelineOrderError,
} from "../utils/errors";
import type { FieldErrors, FormResult } from "@/app/lib/action-result";
import { recordFosterReturn } from "../services/foster-return";
import { recordFosterConversion } from "../services/foster-conversion";

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
            Outcome: { where: { reversedAt: null }, select: { outcomeDate: true } },
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
    const result = await prisma.$transaction((tx) =>
      recordFosterReturn(
        tx,
        { placementId, returnReason, returnNotes, unitId },
        staffMemberId,
      ),
    );
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
    const result = await prisma.$transaction((tx) =>
      recordFosterConversion(
        tx,
        { placementId, adoptionApplicationId },
        staffMemberId,
      ),
    );
    animalId = result.animalId;
  } catch (error) {
    console.error("Database error converting foster placement:", error);
    // A refused day has no picker to show under: the conversion form has no
    // date field, so it is the message alone.
    if (
      error instanceof NotFoundError ||
      error instanceof ConflictError ||
      error instanceof PreconditionFailedError ||
      error instanceof TimelineOrderError
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
