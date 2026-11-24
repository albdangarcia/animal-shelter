import type { Prisma } from "@/prisma/generated/client";

/**
 * The Partner Directory's order for a `sort` param such as "name.asc" or
 * "state.desc". No sort, or one it doesn't know, is by name A to Z.
 *
 * "state" is the State / Country column: a US partner (no country) shows its
 * state and any other its country. Ascending puts the US partners first, by
 * state, then the rest by country code; descending reverses both. The
 * code orders nearly as the printed name does, though not exactly (GB is
 * United Kingdom).
 *
 * No auth or `next/*` imports, so database tests drive it directly.
 */
export const partnersOrderBy = (
  sort: string | undefined,
): Prisma.PartnerOrderByWithRelationInput[] => {
  if (!sort) return [{ name: "asc" }];
  const [field, direction] = sort.split(".");
  const dir = direction === "asc" ? "asc" : "desc";

  switch (field) {
    case "name":
      return [{ name: dir }];
    case "type":
      return [{ type: dir }];
    case "email":
      return [{ email: dir }];
    case "city":
      return [{ city: dir }];
    case "state":
      return [
        { country: { sort: dir, nulls: dir === "asc" ? "first" : "last" } },
        { state: dir },
        // Many partners share a state; the name keeps their order, and so
        // the pages, stable.
        { name: "asc" },
      ];
    case "createdAt":
      return [{ createdAt: dir }];
    default:
      return [{ name: "asc" }];
  }
};
