import prisma, { type TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  AnimalActivityType,
  AnimalListingStatus,
  FosterPlacementType,
  FosterStatus,
} from "@/prisma/generated/enums";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";
import { computeStays, type StayEvent } from "@/app/lib/utils/stay-utils";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

/**
 * Placing an animal with a foster.
 *
 * Like `foster-return`, this module has no `next/*` and no auth imports, so a
 * plain `node:test` can drive it. `makeFosterPlacement` opens the
 * transaction, Serializable for the foster's capacity check, and runs
 * `recordFosterPlacement` in it.
 *
 * Only an animal in the shelter's care can be placed, and both the listing
 * and the timeline have to say so. An archived animal has left, so it is
 * refused even when its timeline ends on an intake: a foster-to-adopt
 * placement lists the animal as pending adoption, which would take it out of
 * the archive without the re-intake that has to bring it back.
 *
 * The listing is read behind the animal's lock. An outcome committed before
 * the placement starts is seen there. One that holds the lock when the
 * placement asks for it makes the placement fail its serializable check once
 * the outcome commits, since the row it locks changed after its snapshot was
 * taken. That attempt is retried once, and the retry reads the archived
 * listing and refuses with the reason.
 */

export type FosterPlacementValues = {
  animalId: string;
  fosterProfileId: string;
  type: FosterPlacementType;
  expectedEndDate?: CalendarDay | null;
  notes?: string | null;
};

const LEFT_MESSAGE =
  "This animal has already left the shelter, so it can't be placed in foster.";

export const recordFosterPlacement = async (
  tx: TransactionClient,
  values: FosterPlacementValues,
  staffMemberId: string,
  today: CalendarDay,
): Promise<void> => {
  const { animalId, fosterProfileId, type, expectedEndDate, notes } = values;

  // Taken first, before anything is read: recording an outcome holds this
  // row while it archives the animal and ends its open placement.
  await lockAnimal(tx, animalId);

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
    throw new PreconditionFailedError("This foster is already at capacity.");
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
  if (animal.listingStatus === AnimalListingStatus.ARCHIVED) {
    throw new PreconditionFailedError(LEFT_MESSAGE);
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

  // Guarded as well as checked above, so that nothing reaching this without
  // the lock can list an archived animal as pending adoption.
  const updated = await tx.animal.updateMany({
    where: {
      id: animalId,
      listingStatus: { not: AnimalListingStatus.ARCHIVED },
    },
    data: {
      currentUnitId: null,
      ...(type === FosterPlacementType.FOSTER_TO_ADOPT && {
        listingStatus: AnimalListingStatus.PENDING_ADOPTION,
      }),
    },
  });
  if (updated.count === 0) {
    throw new PreconditionFailedError(LEFT_MESSAGE);
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
};

/**
 * Whether `error` is Postgres refusing a Serializable transaction because a
 * concurrent one changed what it read (SQLSTATE 40001). Prisma reports it as
 * P2034 from its own queries, and as P2010 from a raw one, such as the lock,
 * where the pg driver adapter carries the SQLSTATE in the error's meta.
 */
export const isSerializationFailure = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2010") return false;
  const meta = error.meta as
    | {
        code?: unknown;
        driverAdapterError?: { cause?: { originalCode?: unknown } };
      }
    | undefined;
  return (
    meta?.code === "40001" ||
    meta?.driverAdapterError?.cause?.originalCode === "40001"
  );
};

/**
 * Makes the placement in a Serializable transaction of its own, retried once
 * if a concurrent write fails it. The retry starts a fresh snapshot, so it
 * judges whatever the other transaction left: an archived animal is refused
 * for that, and a foster filled up in between for capacity. A second failure
 * is thrown to the caller.
 */
export const makeFosterPlacement = async (
  values: FosterPlacementValues,
  staffMemberId: string,
  today: CalendarDay,
  options?: { timeout?: number },
): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await prisma.$transaction(
        (tx) => recordFosterPlacement(tx, values, staffMemberId, today),
        { isolationLevel: "Serializable", ...options },
      );
      return;
    } catch (error) {
      if (attempt < 2 && isSerializationFailure(error)) continue;
      throw error;
    }
  }
};
