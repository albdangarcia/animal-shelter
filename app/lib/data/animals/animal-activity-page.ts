// The where, order and paging of one activity feed page. It lives apart from
// `animal-activity.data.ts`, whose permission wrapper builds the auth instance
// on import, so a DB test can run the exact query the feed runs.

import type { Prisma } from "@/prisma/generated/client";

export const ACTIVITIES_PER_PAGE = 10;

export const animalActivityLogPageArgs = (
  animalId: string,
  currentPage: number
) => ({
  where: { animalId } satisfies Prisma.AnimalActivityLogWhereInput,
  orderBy: [
    { changedAt: "desc" },
    // Only here so rows that share a changedAt land on exactly one page. It
    // does not order related rows; their writers stamp them apart.
    { id: "desc" },
  ] satisfies Prisma.AnimalActivityLogOrderByWithRelationInput[],
  take: ACTIVITIES_PER_PAGE,
  skip: (currentPage - 1) * ACTIVITIES_PER_PAGE,
});
