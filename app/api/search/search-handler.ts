// The GET /api/search handler, with its session, permission and data
// dependencies passed in. `route.ts` wires the real ones; the unit tests pass
// fakes, since the real ones need a request context and a database.
import { NextResponse } from "next/server";
import type { AppPermission } from "@/app/lib/auth/permissions";
import { searchQuerySchema } from "@/app/lib/zod-schemas/common.schemas";
import {
  emptyGlobalSearchResults,
  GLOBAL_SEARCH_GROUP_PERMISSIONS,
  GLOBAL_SEARCH_GROUPS,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  type GlobalSearchGroup,
  type GlobalSearchResults,
} from "@/app/lib/data/search/global-search";

export type SearchHandlerDeps = {
  getSession: () => Promise<{ user?: unknown } | null>;
  hasPermission: (permission: AppPermission) => Promise<boolean>;
  search: (
    query: string,
    groups: readonly GlobalSearchGroup[],
  ) => Promise<GlobalSearchResults>;
};

// Results depend on who is asking and change with every edit.
const NO_STORE = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

export const createSearchHandler =
  ({ getSession, hasPermission, search }: SearchHandlerDeps) =>
  async (request: Request): Promise<Response> => {
    const session = await getSession();
    if (!session?.user) {
      return json({ error: "Unauthorized: You must be logged in." }, 401);
    }

    const permitted = await Promise.all(
      GLOBAL_SEARCH_GROUPS.map((group) =>
        hasPermission(GLOBAL_SEARCH_GROUP_PERMISSIONS[group]),
      ),
    );
    const groups = GLOBAL_SEARCH_GROUPS.filter((_, i) => permitted[i]);
    if (groups.length === 0) {
      return json(
        { error: "Forbidden: You do not have permission to search." },
        403,
      );
    }

    const parsedQuery = searchQuerySchema.safeParse(
      new URL(request.url).searchParams.get("q") ?? "",
    );
    if (!parsedQuery.success) {
      return json({ error: "Invalid search query." }, 400);
    }
    const query = parsedQuery.data;

    if (query.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) {
      return json(emptyGlobalSearchResults(groups));
    }

    try {
      return json(await search(query, groups));
    } catch (error) {
      console.error("Error in global search:", error);
      return json({ error: "Search failed." }, 500);
    }
  };
