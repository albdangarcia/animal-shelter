import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
import prisma from "@/app/lib/prisma";
import type { IntakeType, OutcomeType } from "@/prisma/generated/enums";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { ANIMAL_IMAGE_ORDER } from "../../utils/animal-image-order";
import {
  calendarDay,
  startOfShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";

export type PartnerTransferDirection = "TRANSFER_IN" | "TRANSFER_OUT";

export type PartnerAnimalHistoryEntry = {
  direction: PartnerTransferDirection;
  /**
   * The instant this entry's day begins on the shelter's calendar — a transfer
   * is dated by a day, which carries no time to sort or count "ago" from.
   */
  date: Date | null;
  /** The calendar day itself, which is what the card shows in full. */
  day: CalendarDay;
  animal: {
    id: string;
    name: string;
    species: { name: string };
    animalImages: { url: string }[];
    listingStatus: string;
  };
  intakeType?: IntakeType;
  outcomeType?: OutcomeType;
  // Only populated for TRANSFER_OUT entries: true when the outcome was
  // reversed. It stays in the history, marked, since staff reading it need to
  // see what was recorded and voided, not a gap.
  reversed?: boolean;
};

/** A day-valued entry's two fields: the day, and where it sorts. */
const dated = (day: CalendarDay, timezone: string) => ({ day, date: startOfShelterDay(day, timezone) });

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
            reversedAt: true,
            animal: { select: animalSelect },
          },
        },
      },
    });

    if (!partner) {
      return { history: [] };
    }

    const timezone = (await getShelterSettings()).timezone;
    const history: PartnerAnimalHistoryEntry[] = [
      ...partner.transferredInAnimals.map((intake) => ({
        direction: "TRANSFER_IN" as const,
        ...dated(calendarDay(intake.intakeDate), timezone),
        animal: intake.animal,
        intakeType: intake.type,
      })),
      ...partner.transferredOutAnimals.map((outcome) => ({
        direction: "TRANSFER_OUT" as const,
        ...dated(calendarDay(outcome.outcomeDate), timezone),
        animal: outcome.animal,
        outcomeType: outcome.type,
        reversed: outcome.reversedAt !== null,
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
