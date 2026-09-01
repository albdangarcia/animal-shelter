import prisma from "@/app/lib/prisma";
import type { IntakeType, OutcomeType } from "@/prisma/generated/enums";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { ANIMAL_IMAGE_ORDER } from "../../utils/animal-image-order";

export type PartnerTransferDirection = "TRANSFER_IN" | "TRANSFER_OUT";

export type PartnerAnimalHistoryEntry = {
  direction: PartnerTransferDirection;
  date: Date | null;
  animal: {
    id: string;
    name: string;
    species: { name: string };
    animalImages: { url: string }[];
    listingStatus: string;
  };
  intakeType?: IntakeType;
  outcomeType?: OutcomeType;
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

const _fetchPartnerAnimalHistory = async (
  inputPartnerId: string,
): Promise<{ history: PartnerAnimalHistoryEntry[] }> => {
  const parsedId = cuidSchema.safeParse(inputPartnerId);

  if (!parsedId.success) {
    throw new Error("Invalid partner ID format.");
  }

  const partnerId = parsedId.data;

  try {
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        transferredInAnimals: {
          select: {
            intakeDate: true,
            type: true,
            animal: { select: animalSelect },
          },
        },
        transferredOutAnimals: {
          select: {
            outcomeDate: true,
            type: true,
            animal: { select: animalSelect },
          },
        },
      },
    });

    if (!partner) {
      return { history: [] };
    }

    const history: PartnerAnimalHistoryEntry[] = [
      ...partner.transferredInAnimals.map((intake) => ({
        direction: "TRANSFER_IN" as const,
        date: intake.intakeDate,
        animal: intake.animal,
        intakeType: intake.type,
      })),
      ...partner.transferredOutAnimals.map((outcome) => ({
        direction: "TRANSFER_OUT" as const,
        date: outcome.outcomeDate,
        animal: outcome.animal,
        outcomeType: outcome.type,
      })),
    ];

    history.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.getTime() - a.date.getTime();
    });

    return { history };
  } catch (error) {
    console.error("Error fetching partner animal history.", error);
    throw new Error("Could not fetch partner animal history.");
  }
};

export const fetchPartnerAnimalHistory = RequirePermission(
  AppPermissions.PARTNERS_READ,
)(_fetchPartnerAnimalHistory);
