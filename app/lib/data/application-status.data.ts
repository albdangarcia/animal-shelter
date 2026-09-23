import prisma, { type TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import type { StatusHistoryEntry } from "@/app/lib/types";
import {
  ApplicationConsequence,
  deriveApplicationConsequence,
  deriveApplicationStatuses,
  type EffectiveApplicationStatus,
} from "../utils/derive-application-status";
import { adoptionReason, closureReason } from "../utils/application-status";

// How a read site gets an adoption application's effective status out of the
// database. The rule itself is `deriveApplicationStatus`; this file only feeds
// it rows, so every read site derives the same way.

// What the derivation needs from an application row.
export const DERIVATION_APPLICATION_SELECT = {
  id: true,
  status: true,
  submittedAt: true,
  animalId: true,
} satisfies Prisma.AdoptionApplicationSelect;

export type DerivationApplicationRow = Prisma.AdoptionApplicationGetPayload<{
  select: typeof DERIVATION_APPLICATION_SELECT;
}>;

type OutcomeReader = Pick<TransactionClient, "outcome">;

/**
 * Holds the person's row for the rest of the transaction, so everything read
 * behind it is still true at the write. Two concurrent submissions for the
 * same person and animal — a double-clicked Submit is enough — otherwise both
 * pass the duplicate check and both create an application, which is the state
 * that gate exists to prevent.
 *
 * `FOR NO KEY UPDATE`, not `FOR UPDATE`: two holders still exclude each other,
 * but a foreign-key check on the person still goes through. Recording an
 * outcome whose owner is this person runs one while holding the animal, and
 * `FOR UPDATE` here would make it wait for a transaction that is itself
 * waiting for the animal.
 */
export const lockPerson = (tx: TransactionClient, personId: string) =>
  tx.$queryRaw`SELECT id FROM persons WHERE id = ${personId} FOR NO KEY UPDATE`;

/**
 * Holds the animal's row for the rest of the transaction, so an application's
 * effective status read behind it is still true at the write.
 *
 * Adopted and closed are derived from the animal's outcomes, so no column on
 * the application changes when one is recorded, and a conditional write on
 * the application cannot see it. What both outcome-recording paths do change
 * is the animal: each archives it with an update, the first write of its
 * transaction, and holds that row until it commits. Taking the same row here
 * means an outcome is either committed before this transaction reads, and
 * derived, or it waits until this transaction has written.
 *
 * `FOR NO KEY UPDATE` is the lock that update takes, so the two exclude each
 * other, while inserts that merely reference the animal (an activity row, a
 * note) are not held up behind it.
 *
 * Any write that depends on an application's effective status takes this lock
 * and then derives through the transaction client. Where a path holds both,
 * take `lockPerson` first; nothing takes them the other way round.
 */
export const lockAnimal = (tx: TransactionClient, animalId: string) =>
  tx.$queryRaw`SELECT id FROM animals WHERE id = ${animalId} FOR NO KEY UPDATE`;

/**
 * The effective status of each application, keyed by id.
 *
 * One query fetches the outcomes of every animal involved, however many
 * applications there are. Pass the transaction client to derive behind
 * `lockAnimal`.
 */
export async function effectiveApplicationStatuses(
  applications: readonly DerivationApplicationRow[],
  db: OutcomeReader = prisma,
): Promise<Map<string, EffectiveApplicationStatus>> {
  const animalIds = [...new Set(applications.map((a) => a.animalId))];
  const outcomes =
    animalIds.length === 0
      ? []
      : await db.outcome.findMany({
          where: { animalId: { in: animalIds } },
          select: {
            animalId: true,
            createdAt: true,
            type: true,
            adoptionApplicationId: true,
          },
        });

  // Nothing reverses an outcome yet, so every recorded one is live.
  return deriveApplicationStatuses(
    applications,
    outcomes.map((outcome) => ({ ...outcome, reversed: false })),
  );
}

export async function effectiveApplicationStatus(
  application: DerivationApplicationRow,
  db: OutcomeReader = prisma,
): Promise<EffectiveApplicationStatus> {
  const statuses = await effectiveApplicationStatuses([application], db);
  return statuses.get(application.id)!;
}

/**
 * An application's effective status, and its status history with the outcome
 * that adopted or closed it, if one did, as an entry of its own.
 *
 * The history table records decisions: who moved the application, when and
 * why. Nobody decides that an application was adopted or closed, so nothing
 * writes that into the table; the entry is read off the outcome that caused
 * it, with the staff member who recorded the outcome, the moment it was
 * recorded, and the reason that outcome gives the applicant. `history` is
 * expected newest first, and stays that way.
 */
export async function withConsequenceInHistory<
  Row extends DerivationApplicationRow & { history: StatusHistoryEntry[] },
>(
  application: Row,
  db: OutcomeReader = prisma,
): Promise<
  Omit<Row, "status" | "history"> & {
    status: EffectiveApplicationStatus;
    history: StatusHistoryEntry[];
  }
> {
  const outcomes = await db.outcome.findMany({
    where: { animalId: application.animalId },
    select: {
      id: true,
      createdAt: true,
      type: true,
      adoptionApplicationId: true,
      staffMember: { select: { name: true } },
      fosterPlacement: { select: { id: true } },
    },
    // Two outcomes recorded in the same millisecond would otherwise leave
    // which one closed the application to the order the rows came back in.
    // The smaller id goes first: a cuid begins with the millisecond it was
    // generated and a per-process counter, so it was generated first.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  // Nothing reverses an outcome yet, so every recorded one is live.
  const consequence = deriveApplicationConsequence(
    {
      id: application.id,
      reviewStatus: application.status,
      submittedAt: application.submittedAt,
    },
    outcomes.map((outcome) => ({ ...outcome, reversed: false })),
  );
  if (!consequence) {
    return { ...application, status: application.status };
  }

  const { status, outcome } = consequence;
  const byFoster = outcome.fosterPlacement !== null;
  const entry: StatusHistoryEntry = {
    id: `outcome-${outcome.id}`,
    status,
    statusChangeReason:
      status === ApplicationConsequence.ADOPTED
        ? adoptionReason({ byFoster })
        : closureReason({ type: outcome.type, byFoster }),
    changedAt: outcome.createdAt,
    changedBy: outcome.staffMember,
  };
  return {
    ...application,
    status,
    history: [entry, ...application.history].sort(
      (a, b) => b.changedAt.getTime() - a.changedAt.getTime(),
    ),
  };
}

/**
 * An application's effective status as of now, for a transaction about to
 * write on the strength of it: takes the animal lock, then re-reads the row
 * and the outcomes behind it. Null if the application no longer exists.
 */
export async function effectiveStatusBehindLock(
  tx: TransactionClient,
  application: { id: string; animalId: string },
): Promise<EffectiveApplicationStatus | null> {
  await lockAnimal(tx, application.animalId);
  const row = await tx.adoptionApplication.findUnique({
    where: { id: application.id },
    select: DERIVATION_APPLICATION_SELECT,
  });
  return row && effectiveApplicationStatus(row, tx);
}

// The order a status sort puts applications in: the order a review moves
// through, then the consequences. A record rather than a list so that a status
// added to or removed from the enum is a type error here until someone places
// it.
const STATUS_SORT_RANK: Record<EffectiveApplicationStatus, number> = {
  PENDING: 0,
  REVIEWING: 1,
  WAITLISTED: 2,
  APPROVED: 3,
  REJECTED: 4,
  WITHDRAWN: 5,
  ADOPTED: 6,
  CLOSED: 7,
};

export type ApplicationPage = {
  ids: string[];
  statusById: Map<string, EffectiveApplicationStatus>;
  totalRows: number;
};

/**
 * One page of the applications matching `where`, filtered and sorted by
 * effective status.
 *
 * The database cannot filter or sort by a status it does not store, so when a
 * status filter or a status sort is asked for, every matching application is
 * read (the few columns the derivation needs, not the whole row), derived,
 * then filtered, sorted and cut to the page here. Without either, the database
 * pages as usual and only the page is derived. Callers fetch the page's full
 * rows by id and put them in order with `inPageOrder`.
 */
export async function pageApplicationsByEffectiveStatus({
  where,
  orderBy,
  statuses,
  statusSort,
  offset,
  pageSize,
}: {
  where: Prisma.AdoptionApplicationWhereInput;
  orderBy: Prisma.AdoptionApplicationOrderByWithRelationInput;
  statuses: readonly string[];
  statusSort: Prisma.SortOrder | undefined;
  offset: number;
  pageSize: number;
}): Promise<ApplicationPage> {
  // Every page is a separate query, so the order has to be total: rows tied
  // on the sort key could otherwise come back in a different order on the
  // next page's query, and one would show twice while its twin never showed.
  const totalOrder = (
    first: Prisma.AdoptionApplicationOrderByWithRelationInput,
  ): Prisma.AdoptionApplicationOrderByWithRelationInput[] => [
    first,
    { id: "asc" },
  ];

  if (statuses.length === 0 && !statusSort) {
    const [rows, totalRows] = await Promise.all([
      prisma.adoptionApplication.findMany({
        where,
        orderBy: totalOrder(orderBy),
        skip: offset,
        take: pageSize,
        select: DERIVATION_APPLICATION_SELECT,
      }),
      prisma.adoptionApplication.count({ where }),
    ]);
    return {
      ids: rows.map((row) => row.id),
      statusById: await effectiveApplicationStatuses(rows),
      totalRows,
    };
  }

  const rows = await prisma.adoptionApplication.findMany({
    where,
    // A status sort keeps the default newest-first order within each status.
    orderBy: totalOrder(statusSort ? { submittedAt: "desc" } : orderBy),
    select: DERIVATION_APPLICATION_SELECT,
  });
  const statusById = await effectiveApplicationStatuses(rows);
  const statusOf = (id: string) => statusById.get(id)!;

  let ids = rows.map((row) => row.id);
  if (statuses.length > 0) {
    ids = ids.filter((id) => statuses.includes(statusOf(id)));
  }
  if (statusSort) {
    const direction = statusSort === "asc" ? 1 : -1;
    ids.sort(
      (a, b) =>
        direction * (STATUS_SORT_RANK[statusOf(a)] - STATUS_SORT_RANK[statusOf(b)]),
    );
  }

  return {
    ids: ids.slice(offset, offset + pageSize),
    statusById,
    totalRows: ids.length,
  };
}

// The page's full rows in page order, each carrying its effective status in
// place of the column's.
export function inPageOrder<Row extends { id: string }>(
  rows: readonly Row[],
  page: ApplicationPage,
): (Omit<Row, "status"> & { status: EffectiveApplicationStatus })[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return page.ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ ...row, status: page.statusById.get(id)! }] : [];
  });
}
