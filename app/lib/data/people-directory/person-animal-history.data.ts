import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
import prisma from "@/app/lib/prisma";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import { ANIMAL_IMAGE_ORDER } from "../../utils/animal-image-order";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatuses,
} from "../application-status.data";
import {
  calendarDay,
  startOfShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";

export type PersonAnimalHistoryRole =
  | "SURRENDERER"
  | "FINDER"
  | "OWNER_RECLAIMED"
  | "APPLICANT"
  | "FOSTER_CARER";

export type PersonAnimalHistoryEntry = {
  role: PersonAnimalHistoryRole;
  /**
   * When this happened, for ordering and for the relative time shown on the
   * card. A role dated by an intake or outcome takes the instant its day
   * begins on the shelter's calendar, because a day cannot be ordered against
   * the timestamps it shares this list with.
   */
  date: Date | null;
  /**
   * The calendar day itself, for the roles that have one. It is what the card
   * shows in full, so the browser never re-derives a day from an instant.
   */
  day?: CalendarDay;
  animal: {
    id: string;
    name: string;
    species: { name: string };
    animalImages: { url: string }[];
    listingStatus: string;
  };
  // Only populated for APPLICANT entries: the application's effective status,
  // derived from the animal's outcomes.
  applicationStatus?: string;
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
            ...DERIVATION_APPLICATION_SELECT,
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

    const timezone = (await getShelterSettings()).timezone;
    const applicationStatuses = await effectiveApplicationStatuses(
      person.adoptionApplications,
    );
    const history: PersonAnimalHistoryEntry[] = [
      ...person.surrenderedAnimals.map((intake) => ({
        role: "SURRENDERER" as const,
        ...dated(calendarDay(intake.intakeDate), timezone),
        animal: intake.animal,
      })),
      ...person.foundAnimals.map((intake) => ({
        role: "FINDER" as const,
        ...dated(calendarDay(intake.intakeDate), timezone),
        animal: intake.animal,
      })),
      ...person.reclaimedAnimalsAsOwner.map((outcome) => ({
        role: "OWNER_RECLAIMED" as const,
        ...dated(calendarDay(outcome.outcomeDate), timezone),
        animal: outcome.animal,
      })),
      ...person.adoptionApplications.map((application) => ({
        role: "APPLICANT" as const,
        date: application.submittedAt,
        animal: application.animal,
        applicationStatus: applicationStatuses.get(application.id),
      })),
      ...(person.fosterProfile?.placements.map((placement) => ({
        role: "FOSTER_CARER" as const,
        ...dated(calendarDay(placement.startDate), timezone),
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