import { prisma } from "@/app/lib/prisma";
import { AnimalActivityType, Prisma } from "@prisma/client";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";

export type AnimalJourneyLogPayload = Prisma.AnimalActivityLogGetPayload<{
  include: {
    animal: {
      select: {
        name: true;
        Outcome: {
          select: {
            type: true;
          };
        };
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

const _fetchAnimalJourney = async (
  animalId: string
): Promise<AnimalJourneyLogPayload[]> => {
  const validatedId = cuidSchema.safeParse(animalId);
  if (!validatedId.success) {
    throw new Error("Invalid animal ID format provided.");
  }

  const journeyEventTypes: AnimalActivityType[] = [
    AnimalActivityType.CREATED,
    AnimalActivityType.INTAKE_PROCESSED,
    AnimalActivityType.STATUS_CHANGE,
    AnimalActivityType.OUTCOME_PROCESSED,
  ];

  try {
    const journeyLogs = await prisma.animalActivityLog.findMany({
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
            Outcome: {
              select: {
                type: true,
              },
            },
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
      orderBy: {
        changedAt: "asc",
      },
    });

    return journeyLogs;
  } catch (error) {
    console.error("Error fetching animal journey:", error);
    throw new Error("Could not fetch the animal's journey.");
  }
};

export const fetchAnimalJourney = RequirePermission(
  AppPermissions.ANIMAL_JOURNEY_READ
)(_fetchAnimalJourney);
