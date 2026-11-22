// "The animal is still in the shelter's care": its listing status is not
// ARCHIVED (adopted, transferred or deceased). Shared by the dashboard's
// "tasks due or overdue" count (signal 1 in `attention-signals.ts`) and the
// Tasks list's "Hide animals that have left" switch, so the count and the
// list it links to leave out the same animals. No auth or `next/*` imports.
import type { Prisma } from "@/prisma/generated/client";
import { AnimalListingStatus } from "@/prisma/generated/enums";

export const animalNotArchived = {
  listingStatus: { not: AnimalListingStatus.ARCHIVED },
} satisfies Prisma.AnimalWhereInput;
