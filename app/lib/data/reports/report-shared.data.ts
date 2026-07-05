import { prisma } from "@/app/lib/prisma";
import { OutcomeType } from "@prisma/client";
import { type StayEvent } from "@/app/lib/utils/stay-utils";
import { cuidSchema } from "@/app/lib/zod-schemas/common.schemas";

/**
 * Live outcomes per Shelter Animals Count conventions: an animal that left the
 * shelter alive. EUTHANIZED, DECEASED, and OTHER are non-live. This single
 * definition is the source of truth for both the overview card and the outcomes
 * detail report, so their numbers can never drift apart.
 */
export const LIVE_OUTCOME_TYPES: readonly OutcomeType[] = [
  OutcomeType.ADOPTION,
  OutcomeType.RETURN_TO_OWNER,
  OutcomeType.TRANSFER_OUT,
];

/** True when a given outcome type counts toward the live release rate. */
export function isLiveOutcome(type: OutcomeType): boolean {
  return LIVE_OUTCOME_TYPES.includes(type);
}

/**
 * Splits the raw `species` URL param into validated cuid2 ids, silently
 * dropping any that are malformed. Returns `undefined` when no valid id
 * remains, which the callers treat as "all species" (no filter).
 */
export function parseSpeciesIds(species?: string): string[] | undefined {
  if (!species) return undefined;
  const ids = species
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && cuidSchema.safeParse(s).success);
  return ids.length > 0 ? ids : undefined;
}

/** Prisma `animal` relation filter for a species subset, or `{}` for all. */
export function speciesWhere(speciesIds: string[] | undefined): {
  animal?: { speciesId: { in: string[] } };
} {
  return speciesIds ? { animal: { speciesId: { in: speciesIds } } } : {};
}

/**
 * One animal plus its full intake/outcome history flattened into `StayEvent[]`,
 * ready to feed into `computeStays`. The select is deliberately minimal — this
 * powers length-of-stay and in-care counts and must not drag along images,
 * notes, etc.
 */
export type AnimalStayEvents = {
  id: string;
  name: string;
  speciesId: string;
  speciesName: string;
  events: StayEvent[];
};

/**
 * Fetches animals with their intake/outcome events mapped to `StayEvent[]`,
 * optionally filtered by species ids.
 *
 * PRIVATE building block: intentionally NOT wrapped with `RequirePermission`.
 * It must only ever be called from within a permission-wrapped report fetcher
 * (which is responsible for the `REPORTS_READ` check and for validating the
 * species ids passed in here).
 */
export const _fetchAnimalStayEvents = async (
  speciesIds?: string[],
): Promise<AnimalStayEvents[]> => {
  try {
    const animals = await prisma.animal.findMany({
      where:
        speciesIds && speciesIds.length > 0
          ? { speciesId: { in: speciesIds } }
          : undefined,
      select: {
        id: true,
        name: true,
        speciesId: true,
        species: { select: { name: true } },
        intake: { select: { intakeDate: true } },
        Outcome: { select: { outcomeDate: true } },
      },
    });

    return animals.map((animal) => ({
      id: animal.id,
      name: animal.name,
      speciesId: animal.speciesId,
      speciesName: animal.species.name,
      events: [
        ...animal.intake.map(
          (intake): StayEvent => ({ kind: "intake", date: intake.intakeDate }),
        ),
        ...animal.Outcome.map(
          (outcome): StayEvent => ({
            kind: "outcome",
            date: outcome.outcomeDate,
          }),
        ),
      ],
    }));
  } catch (error) {
    console.error("Error fetching animal stay events.", error);
    throw new Error("Error fetching animal stay events.");
  }
};
