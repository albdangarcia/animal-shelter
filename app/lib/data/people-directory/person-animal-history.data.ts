import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { ANIMAL_IMAGE_ORDER } from "../../utils/animal-image-order";

export type PersonAnimalHistoryRole =
  | "SURRENDERER"
  | "FINDER"
  | "OWNER_RECLAIMED"
  | "APPLICANT"
  | "FOSTER_CARER";

export type PersonAnimalHistoryEntry = {
  role: PersonAnimalHistoryRole;
  date: Date | null;
  animal: {
    id: string;
    name: string;
    species: { name: string };
    animalImages: { url: string }[];
    listingStatus: string;
  };
  // Only populated for APPLICANT entries
  applicationStatus?: string;
};

const animalSelect = {
  id: true,
  name: true,
  listingStatus: true,
  species: { select: { name: true } },
  animalImages: {
    select: { url: true },
    orderBy: ANIMAL_IMAGE_ORDER,
    take: 1,
  },
} as const;

const _fetchPersonAnimalHistory = async (
  inputPersonId: string
): Promise<{ history: PersonAnimalHistoryEntry[] }> => {
  const parsedId = cuidSchema.safeParse(inputPersonId);

  if (!parsedId.success) {
    throw new Error("Invalid person ID format.");
  }

  const personId = parsedId.data;

  try {
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: {
        surrenderedAnimals: {
          select: {
            intakeDate: true,
            animal: { select: animalSelect },
          },
        },
        foundAnimals: {
          select: {
            intakeDate: true,
            animal: { select: animalSelect },
          },
        },
        reclaimedAnimalsAsOwner: {
          select: {
            outcomeDate: true,
            animal: { select: animalSelect },
          },
        },
        adoptionApplications: {
          select: {
            submittedAt: true,
            status: true,
            animal: { select: animalSelect },
          },
        },
        fosterProfile: {
          select: {
            placements: {
              select: {
                startDate: true,
                animal: { select: animalSelect },
              },
            },
          },
        },
      },
    });

    if (!person) {
      return { history: [] };
    }

    const history: PersonAnimalHistoryEntry[] = [
      ...person.surrenderedAnimals.map((intake) => ({
        role: "SURRENDERER" as const,
        date: intake.intakeDate,
        animal: intake.animal,
      })),
      ...person.foundAnimals.map((intake) => ({
        role: "FINDER" as const,
        date: intake.intakeDate,
        animal: intake.animal,
      })),
      ...person.reclaimedAnimalsAsOwner.map((outcome) => ({
        role: "OWNER_RECLAIMED" as const,
        date: outcome.outcomeDate,
        animal: outcome.animal,
      })),
      ...person.adoptionApplications.map((application) => ({
        role: "APPLICANT" as const,
        date: application.submittedAt,
        animal: application.animal,
        applicationStatus: application.status,
      })),
      ...(person.fosterProfile?.placements.map((placement) => ({
        role: "FOSTER_CARER" as const,
        date: placement.startDate,
        animal: placement.animal,
      })) ?? []),
    ];

    // Most recent first; entries without a date sort last
    history.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.getTime() - a.date.getTime();
    });

    return { history };
  } catch (error) {
    console.error("Error fetching person animal history.", error);
    throw new Error("Could not fetch person animal history.");
  }
};

export const fetchPersonAnimalHistory = RequirePermission(
  AppPermissions.PERSONS_READ
)(_fetchPersonAnimalHistory);