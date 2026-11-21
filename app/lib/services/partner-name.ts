import { Prisma } from "@/prisma/generated/client";
import type { TransactionClient } from "@/app/lib/prisma";

/**
 * The partner names the Partner Directory refuses.
 *
 * No two partners share a name in any capitals, so "walk vet clinic" is
 * refused next to "Walk Vet Clinic". `Partner.name` is `@unique` in the
 * schema, but only for an exact match; this finder covers the rest, and the
 * actions keep their P2002 handlers as the backstop for the exact match.
 *
 * Every partner counts, an inactive one included: `Partner` has `isActive` but
 * no `deletedAt`, and a retired partner is still picked as a source or a
 * destination, so its name stays taken.
 *
 * Names are compared trimmed, on both sides, of the same characters (spaces,
 * tabs, line breaks and the no-break space): the form does not trim what it
 * saves, so a stored "Walk Vet Clinic " and a typed "walk vet clinic" are the
 * same name. SQL `btrim` takes the characters to strip, so the two sides
 * cannot disagree the way `btrim(name)` (spaces only) and `String.trim()` do.
 *
 * Runs against the plain client or a transaction. No auth or `next/*`
 * imports, so database tests drive it directly.
 */

export const PARTNER_NAME_TAKEN = "A partner with this name already exists.";

type Db = Pick<TransactionClient, "$queryRaw">;
type Named = { id: string; name: string };

const PADDING = " \t\n\r\f\v\u00a0";
const PADDING_ENDS = new RegExp(`^[${PADDING}]+|[${PADDING}]+$`, "g");
const trimmed = (name: string) => name.replace(PADDING_ENDS, "");

/**
 * The partner named `name` in any capitals, other than `excludeId`. Compared
 * with `lower()` in SQL, not Prisma's insensitive `equals`: that is an
 * `ILIKE`, which reads `_` and `%` in the name as wildcards ("Pet_x" would
 * match "Petzx") and fails outright on a name ending in a backslash.
 */
export const findPartnerNamed = async (
  db: Db,
  name: string,
  excludeId?: string,
): Promise<Named | null> => {
  const rows = await db.$queryRaw<Named[]>`
    SELECT id, name FROM partners
    WHERE lower(btrim(name, ${PADDING})) = lower(${trimmed(name)})
      ${excludeId ? Prisma.sql`AND id <> ${excludeId}` : Prisma.empty}
    LIMIT 1`;
  return rows[0] ?? null;
};

/**
 * The refusal to show for saving a partner as `name`, or null when it is free.
 *
 * Pass `stored` (the partner's id and name as saved) for an edit: the check
 * runs only when the submitted name differs from the stored one, and skips the
 * partner itself, so changing another field of a partner whose case-variant
 * twin already exists is not refused.
 */
export const partnerNameRefusal = async (
  db: Db,
  name: string,
  stored?: Named,
): Promise<string | null> => {
  if (stored && name === stored.name) return null;
  const taken = await findPartnerNamed(db, name, stored?.id);
  return taken ? PARTNER_NAME_TAKEN : null;
};
