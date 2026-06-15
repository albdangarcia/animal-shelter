import { prisma } from "@/app/lib/prisma";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { Permissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";

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
    orderBy: { createdAt: "asc" as const },
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
            animalsFostered: { select: animalSelect },
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
      ...(person.fosterProfile?.animalsFostered.map((animal) => ({
        role: "FOSTER_CARER" as const,
        date: null,
        animal,
      })) ?? []),
    ];

    // Most recent first; entries without a date (foster) sort last
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
  Permissions.PERSONS_READ_DETAIL
)(_fetchPersonAnimalHistory);