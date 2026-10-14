import type { TransactionClient } from "@/app/lib/prisma";
import { Prisma } from "@/prisma/generated/client";
import {
  DoseUnit,
  MedicalItemKind,
  MedicalRoute,
} from "@/prisma/generated/enums";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";
import { MAX_REPEAT_INTERVAL_DAYS } from "@/app/lib/utils/medical-days";

/**
 * The catalog of vaccines, tests and treatments staff pick from when they
 * record care. Admins manage it; entries hold a foreign key to their item.
 *
 * Items and analytes are retired, never deleted: retiring hides them from new
 * entries and leaves every entry that already uses them as it was. Retiring an
 * item can be undone. An analyte is brought back by adding it again under the
 * same name.
 *
 * This module has **no `next/*` and no auth imports**, so a plain `node:test`
 * can drive it. Each function runs inside the caller's `prisma.$transaction`.
 */

export interface MedicalItemAnalyteInput {
  /** An analyte the item already has. Absent for a new one. */
  id?: string | null;
  name: string;
}

export interface MedicalItemInput {
  kind: MedicalItemKind;
  name: string;
  manufacturer?: string | null;
  /** Empty means the item applies to every species. */
  speciesIds: string[];
  defaultRoute?: MedicalRoute | null;
  defaultDoseAmount?: number | null;
  defaultDoseUnit?: DoseUnit | null;
  repeatIntervalDays?: number | null;
  isRabies?: boolean;
  /**
   * Tests only, in the order results are asked for. On an update, a live
   * analyte left out of the list is retired.
   */
  analytes: MedicalItemAnalyteInput[];
}

const KIND_NOUN: Record<MedicalItemKind, string> = {
  VACCINE: "vaccine",
  TEST: "test",
  TREATMENT: "treatment",
};

const tidyName = (value: string) => value.trim().replace(/\s+/g, " ");

const tidyOptional = (value: string | null | undefined) => {
  const tidied = value == null ? "" : tidyName(value);
  return tidied === "" ? null : tidied;
};

interface NormalisedItem {
  kind: MedicalItemKind;
  name: string;
  manufacturer: string | null;
  speciesIds: string[];
  defaultRoute: MedicalRoute | null;
  defaultDoseAmount: number | null;
  defaultDoseUnit: DoseUnit | null;
  repeatIntervalDays: number | null;
  isRabies: boolean;
  analytes: { id: string | null; name: string }[];
}

/** The rules that need nothing but the input. */
const normalise = (input: MedicalItemInput): NormalisedItem => {
  const name = tidyName(input.name);
  if (!name) {
    throw new PreconditionFailedError("A name is required.");
  }

  const isRabies = input.isRabies ?? false;
  if (isRabies && input.kind !== MedicalItemKind.VACCINE) {
    throw new PreconditionFailedError("Only a vaccine can be a rabies vaccine.");
  }

  const defaultRoute = input.defaultRoute ?? null;
  const defaultDoseAmount = input.defaultDoseAmount ?? null;
  const defaultDoseUnit = input.defaultDoseUnit ?? null;
  if (input.kind === MedicalItemKind.TEST) {
    if (defaultRoute || defaultDoseAmount !== null || defaultDoseUnit) {
      throw new PreconditionFailedError(
        "A test has no default route or dose.",
      );
    }
  }
  if (input.kind === MedicalItemKind.VACCINE) {
    if (defaultDoseAmount !== null || defaultDoseUnit) {
      throw new PreconditionFailedError(
        "A vaccine has a default route, but no default dose.",
      );
    }
  }
  if (defaultDoseAmount !== null && !(defaultDoseAmount > 0)) {
    throw new PreconditionFailedError(
      "The default dose must be more than zero.",
    );
  }
  if (defaultDoseAmount !== null && !defaultDoseUnit) {
    throw new PreconditionFailedError(
      "A default dose needs a unit.",
    );
  }

  const repeatIntervalDays = input.repeatIntervalDays ?? null;
  if (
    repeatIntervalDays !== null &&
    (!Number.isInteger(repeatIntervalDays) || repeatIntervalDays < 1)
  ) {
    throw new PreconditionFailedError(
      "The repeat interval must be a whole number of days, at least one.",
    );
  }
  // Recording offers to schedule the next dose this many days on, and care
  // can't be scheduled further ahead than this.
  if (repeatIntervalDays !== null && repeatIntervalDays > MAX_REPEAT_INTERVAL_DAYS) {
    throw new PreconditionFailedError(
      `The repeat interval can be at most ${MAX_REPEAT_INTERVAL_DAYS} days (five years), since care can't be scheduled further ahead.`,
    );
  }

  const analytes = input.analytes.map((analyte) => ({
    id: analyte.id ?? null,
    name: tidyName(analyte.name),
  }));
  if (input.kind === MedicalItemKind.TEST) {
    if (analytes.some((analyte) => !analyte.name)) {
      throw new PreconditionFailedError("Every analyte needs a name.");
    }
    if (analytes.length === 0) {
      throw new PreconditionFailedError(
        "A test needs at least one analyte: what the test reports a result for.",
      );
    }
    const seen = new Set<string>();
    for (const analyte of analytes) {
      const key = analyte.name.toLowerCase();
      if (seen.has(key)) {
        throw new PreconditionFailedError(
          `The analyte "${analyte.name}" is listed twice.`,
        );
      }
      seen.add(key);
    }
  } else if (analytes.length > 0) {
    throw new PreconditionFailedError("Only a test has analytes.");
  }

  return {
    kind: input.kind,
    name,
    manufacturer: tidyOptional(input.manufacturer),
    speciesIds: [...new Set(input.speciesIds)],
    defaultRoute,
    defaultDoseAmount,
    defaultDoseUnit,
    repeatIntervalDays,
    isRabies,
    analytes,
  };
};

/**
 * Holds one item against changes until the transaction ends. Every catalog
 * write takes it first, and recording or correcting an entry takes
 * `lockMedicalItemForUse` on its item, so an item's kind can't change between
 * an entry checking it and the entry being written, and the check that an
 * item is unused sees an entry written at the same moment.
 */
export const lockMedicalItem = (tx: TransactionClient, itemId: string) =>
  tx.$queryRaw`SELECT id FROM medical_items WHERE id = ${itemId} FOR NO KEY UPDATE`;

/**
 * Held by an entry write on its item. Shared, so entries on one item don't
 * wait for each other, only for a catalog write.
 */
export const lockMedicalItemForUse = (tx: TransactionClient, itemId: string) =>
  tx.$queryRaw`SELECT id FROM medical_items WHERE id = ${itemId} FOR SHARE`;

/**
 * Names are unique per kind, retired items included, ignoring case. The
 * unique index only knows the exact spelling, so two writes of "DHPP" and
 * "dhpp" at once are serialised on a lock keyed by the kind and the name in
 * lower case, held until commit, and the second sees the first. Names are
 * compared with `lower()` on both sides: a case-insensitive `equals` is sent
 * as ILIKE, which reads `_`, `%` and a backslash in the name as a pattern.
 */
const refuseDuplicateName = async (
  tx: TransactionClient,
  kind: MedicalItemKind,
  name: string,
  excludeId?: string,
) => {
  // The key's lower case is the database's, the same `lower()` the check
  // below compares with: JavaScript's can differ ("İ"), and two names the
  // check counts as one would then take different locks.
  await tx.$queryRaw`
    SELECT 1 FROM pg_advisory_xact_lock(
      hashtext('medical_item:' || ${kind}::text || ':' || lower(${name}))
    )`;
  const [existing] = await tx.$queryRaw<
    { name: string; retiredAt: Date | null }[]
  >`
    SELECT name, retired_at AS "retiredAt" FROM medical_items
    WHERE kind = ${kind}::"MedicalItemKind"
      AND lower(name) = lower(${name})
      AND id IS DISTINCT FROM ${excludeId ?? null}
    LIMIT 1`;
  if (existing) {
    throw new ConflictError(
      existing.retiredAt
        ? `A retired ${KIND_NOUN[kind]} named "${existing.name}" already exists. Unretire it instead.`
        : `A ${KIND_NOUN[kind]} named "${existing.name}" already exists.`,
    );
  }
};

const refuseUnknownSpecies = async (
  tx: TransactionClient,
  speciesIds: string[],
) => {
  if (speciesIds.length === 0) return;
  const found = await tx.species.count({ where: { id: { in: speciesIds } } });
  if (found !== speciesIds.length) {
    throw new PreconditionFailedError("One of the species no longer exists.");
  }
};

/** The unique index on `(kind, name)`, reached by a write that raced the check. */
const rethrowDuplicate = (error: unknown, item: NormalisedItem): never => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ConflictError(
      `A ${KIND_NOUN[item.kind]} named "${item.name}" already exists.`,
    );
  }
  throw error;
};

export const createMedicalItem = async (
  tx: TransactionClient,
  input: MedicalItemInput,
): Promise<{ id: string }> => {
  const item = normalise(input);
  if (item.analytes.some((analyte) => analyte.id)) {
    throw new PreconditionFailedError("A new item has no analytes yet.");
  }
  await refuseDuplicateName(tx, item.kind, item.name);
  await refuseUnknownSpecies(tx, item.speciesIds);

  try {
    return await tx.medicalItem.create({
      data: {
        kind: item.kind,
        name: item.name,
        manufacturer: item.manufacturer,
        species: { connect: item.speciesIds.map((id) => ({ id })) },
        defaultRoute: item.defaultRoute,
        defaultDoseAmount: item.defaultDoseAmount,
        defaultDoseUnit: item.defaultDoseUnit,
        repeatIntervalDays: item.repeatIntervalDays,
        isRabies: item.isRabies,
        analytes: {
          create: item.analytes.map((analyte, index) => ({
            name: analyte.name,
            sortOrder: index,
          })),
        },
      },
      select: { id: true },
    });
  } catch (error) {
    return rethrowDuplicate(error, item);
  }
};

export const updateMedicalItem = async (
  tx: TransactionClient,
  itemId: string,
  input: MedicalItemInput,
): Promise<void> => {
  const item = normalise(input);

  await lockMedicalItem(tx, itemId);
  const current = await tx.medicalItem.findUnique({
    where: { id: itemId },
    select: {
      kind: true,
      analytes: { select: { id: true, name: true, retiredAt: true } },
    },
  });
  if (!current) {
    throw new NotFoundError("Catalog item not found.");
  }

  // An entry's kind must match its item's, and entries never change kind,
  // so an item in use keeps its kind.
  if (item.kind !== current.kind) {
    const used = await tx.medicalEntry.count({ where: { itemId } });
    if (used > 0) {
      throw new ConflictError(
        `This ${KIND_NOUN[current.kind]} has been used on animals, so it can't become a ${KIND_NOUN[item.kind]}. Retire it and add a new item instead.`,
      );
    }
  }

  await refuseDuplicateName(tx, item.kind, item.name, itemId);
  await refuseUnknownSpecies(tx, item.speciesIds);

  try {
    await tx.medicalItem.update({
      where: { id: itemId },
      data: {
        kind: item.kind,
        name: item.name,
        manufacturer: item.manufacturer,
        species: { set: item.speciesIds.map((id) => ({ id })) },
        defaultRoute: item.defaultRoute,
        defaultDoseAmount: item.defaultDoseAmount,
        defaultDoseUnit: item.defaultDoseUnit,
        repeatIntervalDays: item.repeatIntervalDays,
        isRabies: item.isRabies,
      },
    });
  } catch (error) {
    rethrowDuplicate(error, item);
  }

  if (item.kind === MedicalItemKind.TEST) {
    await reconcileAnalytes(tx, itemId, current.analytes, item.analytes);
  } else if (current.analytes.length > 0) {
    // Only reachable when an unused test changes kind (a used one can't), so
    // no result points at these.
    await tx.medicalItemAnalyte.deleteMany({ where: { itemId } });
  }
};

/**
 * Bring an item's analytes in line with the list from the form: rename the
 * ones it names by id, add the new ones, set the order from the list, and
 * retire the live ones it leaves out. A new row whose name matches one of the
 * item's analytes the list leaves out, retired or removed and added back in
 * the same edit, is that analyte rather than a second one, so its old
 * results and the new ones stay one analyte.
 */
const reconcileAnalytes = async (
  tx: TransactionClient,
  itemId: string,
  existing: { id: string; name: string; retiredAt: Date | null }[],
  wanted: { id: string | null; name: string }[],
) => {
  const byId = new Map(existing.map((analyte) => [analyte.id, analyte]));
  const wantedIds = new Set(
    wanted.flatMap((analyte) => (analyte.id ? [analyte.id] : [])),
  );

  // Resolve each row to the analyte it will be: named by id, one left out
  // being brought back, or a new one.
  const claimed = new Set<string>();
  const resolved = wanted.map((analyte) => {
    if (analyte.id) {
      const found = byId.get(analyte.id);
      if (!found) {
        throw new PreconditionFailedError(
          "One of the analytes doesn't belong to this test.",
        );
      }
      return { id: found.id, name: analyte.name };
    }
    const leftOut = existing.find(
      (candidate) =>
        !wantedIds.has(candidate.id) &&
        !claimed.has(candidate.id) &&
        candidate.name.toLowerCase() === analyte.name.toLowerCase(),
    );
    if (leftOut) claimed.add(leftOut.id);
    return { id: leftOut?.id ?? null, name: analyte.name };
  });

  // A name held by an analyte that stays retired can't be reused by another.
  const keptIds = new Set(resolved.flatMap((row) => (row.id ? [row.id] : [])));
  for (const row of resolved) {
    const clash = existing.find(
      (candidate) =>
        candidate.id !== row.id &&
        !keptIds.has(candidate.id) &&
        candidate.name.toLowerCase() === row.name.toLowerCase(),
    );
    if (clash) {
      throw new ConflictError(
        `"${clash.name}" was an analyte of this test. Add it back under that name instead of giving the name to another.`,
      );
    }
  }

  const now = new Date();
  await tx.medicalItemAnalyte.updateMany({
    where: {
      itemId,
      retiredAt: null,
      id: { notIn: [...keptIds] },
    },
    data: { retiredAt: now },
  });

  // Two analytes swapping names would trip the unique index halfway through,
  // so the renamed ones step aside under their ids first.
  const renamed = resolved.filter(
    (row) => row.id && byId.get(row.id)?.name !== row.name,
  );
  for (const row of renamed) {
    await tx.medicalItemAnalyte.update({
      where: { id: row.id! },
      data: { name: row.id! },
    });
  }

  for (const [index, row] of resolved.entries()) {
    if (row.id) {
      await tx.medicalItemAnalyte.update({
        where: { id: row.id },
        data: { name: row.name, sortOrder: index, retiredAt: null },
      });
    } else {
      await tx.medicalItemAnalyte.create({
        data: { itemId, name: row.name, sortOrder: index },
      });
    }
  }
};

export const retireMedicalItem = async (
  tx: TransactionClient,
  itemId: string,
): Promise<void> => {
  await lockMedicalItem(tx, itemId);
  const item = await tx.medicalItem.findUnique({
    where: { id: itemId },
    select: { retiredAt: true },
  });
  if (!item) {
    throw new NotFoundError("Catalog item not found.");
  }
  if (item.retiredAt) {
    throw new ConflictError("This item is already retired.");
  }
  await tx.medicalItem.update({
    where: { id: itemId },
    data: { retiredAt: new Date() },
  });
};

export const unretireMedicalItem = async (
  tx: TransactionClient,
  itemId: string,
): Promise<void> => {
  await lockMedicalItem(tx, itemId);
  const item = await tx.medicalItem.findUnique({
    where: { id: itemId },
    select: { retiredAt: true },
  });
  if (!item) {
    throw new NotFoundError("Catalog item not found.");
  }
  if (!item.retiredAt) {
    throw new ConflictError("This item isn't retired.");
  }
  await tx.medicalItem.update({
    where: { id: itemId },
    data: { retiredAt: null },
  });
};
