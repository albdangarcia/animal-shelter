import prisma from "@/app/lib/prisma";
import {
  runGlobalSearch,
  type GlobalSearchGroup,
  type GlobalSearchResults,
} from "./global-search";

export type * from "./global-search";

// Not wrapped in RequirePermission: the caller (`app/api/search/route.ts`)
// resolves which groups the user may read and passes only those.
export const searchEverything = async (
  query: string,
  groups: readonly GlobalSearchGroup[],
): Promise<GlobalSearchResults> => {
  try {
    return await runGlobalSearch(prisma, query, groups);
  } catch (error) {
    console.error("Error running global search.", error);
    throw new Error("Error running global search.");
  }
};
