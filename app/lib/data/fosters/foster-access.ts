/**
 * Whether a person fosters an animal now: the one rule every foster read and
 * write goes through.
 *
 * A person fosters an animal while a foster placement of theirs for it is
 * open (no end day). Access lasts exactly as long as that: a return, a
 * conversion or an outcome ends it at once, and an outcome reversal that
 * reopens the placement brings it back. The foster profile's status (paused,
 * inactive) doesn't matter, nor does the person's role.
 *
 * No auth or `next/*` imports, so the database tests drive it. Reads call
 * `findOpenPlacement` and treat null as not found; writes call
 * `checkFostering` inside their transaction, after taking the animal's lock,
 * so a return or an outcome committed at the same moment is either seen or
 * waits for the write.
 */
import type prisma from "@/app/lib/prisma";
import type { TransactionClient } from "@/app/lib/prisma";
import { MedicalEntryRefusal } from "@/app/lib/services/medical-entry-values";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";

type Db = TransactionClient | typeof prisma;

export type OpenFosterPlacement = {
  id: string;
  /** The day the animal was placed with this person. */
  startDate: CalendarDay;
};

/**
 * The open placement of `animalId` with `personId`, or null when there is
 * none. An empty person id finds nothing: Prisma reads an undefined or empty
 * filter as "any", which would match every foster's placement.
 */
export async function findOpenPlacement(
  db: Db,
  personId: string,
  animalId: string,
): Promise<OpenFosterPlacement | null> {
  if (!personId || !animalId) return null;

  const placement = await db.fosterPlacement.findFirst({
    where: { animalId, endDate: null, fosterProfile: { personId } },
    select: { id: true, startDate: true },
  });
  return placement
    ? { id: placement.id, startDate: calendarDay(placement.startDate) }
    : null;
}

export const NOT_FOSTERING_MESSAGE =
  "This animal isn't in your care any more, so nothing can be recorded for it.";

/**
 * The open placement a foster's write is made under, read in the write's
 * transaction after the caller has taken `lockAnimal`. Refuses when there is
 * none.
 */
export async function checkFostering(
  tx: TransactionClient,
  personId: string,
  animalId: string,
): Promise<OpenFosterPlacement> {
  const placement = await findOpenPlacement(tx, personId, animalId);
  if (!placement) throw new MedicalEntryRefusal(NOT_FOSTERING_MESSAGE);
  return placement;
}
