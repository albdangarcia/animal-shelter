import prisma from "@/app/lib/prisma";
import { AnimalActivityType, type OutcomeType } from "@/prisma/generated/enums";
import type { Prisma } from "@/prisma/generated/client";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";

export type AnimalJourneyLogPayload = Prisma.AnimalActivityLogGetPayload<{
  include: {
    animal: {
      select: {
        name: true;
        intake: {
          select: {
            type: true;
          };
        };
      };
    };
    changedBy: {
      select: {
        name: true;
      };
    };
  };
}>;

export type AnimalJourneyItem = AnimalJourneyLogPayload & {
  // The outcome an OUTCOME_PROCESSED entry recorded, reversed or not; null on
  // every other entry.
  outcome: { type: OutcomeType; reversedAt: Date | null } | null;
};

const _fetchAnimalJourney = async (
  animalId: string,
): Promise<AnimalJourneyItem[]> => {
  const validatedId = cuidSchema.safeParse(animalId);
  if (!validatedId.success) {
    throw new Error("Invalid animal ID format provided.");
  }

  const journeyEventTypes: AnimalActivityType[] = [
    AnimalActivityType.CREATED,
    AnimalActivityType.INTAKE_PROCESSED,
    AnimalActivityType.STATUS_CHANGE,
    AnimalActivityType.OUTCOME_PROCESSED,
    // A reversed outcome stays on the journey, marked, and the reversal
    // follows it with its reason: the animal left on the record and came
    // back, and both are part of its history.
    AnimalActivityType.OUTCOME_REVERSED,
    // A foster placement isn't an outcome — the animal stays "in
    // care" the whole time — but its start/end are still significant enough
    // to surface here, so the journey doesn't read as a silent gap between
    // intake and outcome.
    AnimalActivityType.FOSTER_PLACED,
    AnimalActivityType.FOSTER_RETURNED,
  ];

  try {
    // One snapshot for both reads, so they are paired below as of the same
    // moment. An outcome and its OUTCOME_PROCESSED row commit together, so a
    // snapshot holds both or neither; two separate reads could see an
    // outcome recorded between them without its row, and shift every pair.
    const [journeyLogs, outcomes] = await prisma.$transaction(
      [
        prisma.animalActivityLog.findMany({
          where: {
            animalId: validatedId.data,
            activityType: {
              in: journeyEventTypes,
            },
          },
          include: {
            animal: {
              select: {
                name: true,
                intake: {
                  select: {
                    type: true,
                  },
                },
              },
            },
            changedBy: {
              select: {
                name: true,
              },
            },
          },
          orderBy: [{ changedAt: "asc" }, { id: "asc" }],
        }),
        prisma.outcome.findMany({
          where: { animalId: validatedId.data },
          select: { type: true, reversedAt: true },
          // Latest first, as the pairing below counts from the latest end.
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );

    // An activity row does not link the outcome it records. Each recording
    // writes one outcome and one OUTCOME_PROCESSED row, so they pair by order,
    // counted from the latest: an outcome older than these rows leaves the
    // rest paired. Order rather than timestamps, since a database seeded
    // before the seed backdated `createdAt` has every outcome stamped with
    // the seeding time. Titling each entry from any one of the animal's
    // outcomes would label them all alike once it has several, and could not
    // mark the reversed one.
    const outcomeRows = journeyLogs.filter(
      (log) => log.activityType === AnimalActivityType.OUTCOME_PROCESSED,
    );
    const outcomeOf = new Map(
      outcomeRows.map((log, index) => {
        const outcome = outcomes[outcomeRows.length - 1 - index];
        return [
          log.id,
          outcome
            ? { type: outcome.type, reversedAt: outcome.reversedAt }
            : null,
        ];
      }),
    );
    return journeyLogs.map((log) => ({
      ...log,
      outcome: outcomeOf.get(log.id) ?? null,
    }));
  } catch (error) {
    console.error("Error fetching animal journey:", error);
    throw new Error("Could not fetch the animal's journey.");
  }
};

export const fetchAnimalJourney = RequirePermission(
  AppPermissions.ANIMAL_JOURNEY_READ,
)(_fetchAnimalJourney);
