// The dashboard's "Applications waiting" card: adoption and foster
// applications waiting for a review decision, and how long the oldest has
// waited. No auth or `next/*` imports, so database tests can call it; the
// dashboard's data module (analytics.data.ts) wraps each count with its
// permission.

import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import type { CalendarDay } from "../utils/shelter-day";
import {
  WAITING_STATUSES,
  summariseWaiting,
  type ApplicationsWaiting,
} from "../utils/applications-waiting";
import {
  DERIVATION_APPLICATION_SELECT,
  effectiveApplicationStatuses,
} from "./application-status.data";

type Db = typeof prisma;

type CountOptions<Where> = {
  /** The shelter's today, and its timezone, for the oldest's age in days. */
  today: CalendarDay;
  timezone: string;
  /** ANDed with the status filter, so it can only narrow: the database tests
   *  share one database and narrow to their own applications. */
  where?: Where;
};

const isWaiting = (status: string) =>
  (WAITING_STATUSES as readonly string[]).includes(status);

/**
 * Adoption applications waiting for a decision, by **effective** status: one
 * stored as PENDING whose animal left while it was open is CLOSED, and is not
 * counted. The rule is `deriveApplicationStatus`'s; this only feeds it rows.
 *
 * Reading only the rows whose column is PENDING or REVIEWING is safe, not a
 * second copy of the rule: the derivation returns either the column's value
 * or ADOPTED/CLOSED, so a row stored as anything else can never derive into a
 * waiting status.
 */
export const countAdoptionApplicationsWaiting = async (
  db: Db,
  { today, timezone, where }: CountOptions<Prisma.AdoptionApplicationWhereInput>,
): Promise<ApplicationsWaiting> => {
  const rows = await db.adoptionApplication.findMany({
    where: {
      AND: [{ status: { in: [...WAITING_STATUSES] } }, where ?? {}],
    },
    select: DERIVATION_APPLICATION_SELECT,
  });
  const statusById = await effectiveApplicationStatuses(rows, db);
  return summariseWaiting(
    rows
      .filter((row) => isWaiting(statusById.get(row.id)!))
      .map((row) => row.submittedAt),
    today,
    timezone,
  );
};

/**
 * Foster applications waiting for a decision. A foster application has no
 * animal and no outcome, so its status column is its status.
 */
export const countFosterApplicationsWaiting = async (
  db: Db,
  { today, timezone, where }: CountOptions<Prisma.FosterApplicationWhereInput>,
): Promise<ApplicationsWaiting> => {
  const filter: Prisma.FosterApplicationWhereInput = {
    AND: [{ status: { in: [...WAITING_STATUSES] } }, where ?? {}],
  };
  const [count, oldest] = await Promise.all([
    db.fosterApplication.count({ where: filter }),
    db.fosterApplication.findFirst({
      where: filter,
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      select: { submittedAt: true },
    }),
  ]);
  if (count === 0 || !oldest) return { count: 0, oldestDays: null };
  return {
    count,
    oldestDays: summariseWaiting([oldest.submittedAt], today, timezone)
      .oldestDays,
  };
};
