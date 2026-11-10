// The GET /api/search handler, with its session, permission and data
// dependencies passed in. `route.ts` wires the real ones; the unit tests pass
// fakes, since the real ones need a request context and a database.
import { NextResponse } from "next/server";
import type { AppPermission } from "@/app/lib/auth/permissions";
import type { Guide } from "@/app/lib/guides/guides";
import { searchGuides, type GuideSearchHit } from "@/app/lib/guides/search";
import {
  heldGuidePermissions,
  visibleGuides,
} from "@/app/lib/guides/visibility";
import { searchQuerySchema } from "@/app/lib/zod-schemas/common.schemas";
import {
  emptyGlobalSearchResults,
  GLOBAL_SEARCH_GROUP_PERMISSIONS,
  GLOBAL_SEARCH_GROUP_LIMIT,
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
  /** Every guide; the handler keeps the ones the caller can see. */
  getGuides: () => Promise<Guide[]>;
};

/**
 * The record groups, plus the Help group: the guides the caller can see that
 * match. Help is null, and hidden, when the caller can see no guides.
 */
export type SearchResponse = GlobalSearchResults & {
  help: GuideSearchHit[] | null;
};

/** As many guides as a record group shows. */
export const HELP_GROUP_LIMIT = GLOBAL_SEARCH_GROUP_LIMIT;

// Results depend on who is asking and change with every edit.
const NO_STORE = { "Cache-Control": "no-store" };

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

/**
 * The guides the caller can see, or null when there are none. A guide that
 * can't be read leaves the Help group out rather than failing the records.
 */
async function callerGuides(
  getGuides: SearchHandlerDeps["getGuides"],
  hasPermission: SearchHandlerDeps["hasPermission"],
): Promise<Guide[] | null> {
  try {
    const guides = await getGuides();
    const visible = visibleGuides(
      guides,
      await heldGuidePermissions(guides, hasPermission),
    );
    return visible.length > 0 ? visible : null;
  } catch (error) {
    console.error("Error loading guides for global search:", error);
    return null;
  }
}

export const createSearchHandler =
  ({ getSession, hasPermission, search, getGuides }: SearchHandlerDeps) =>
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

    // The palette is offered on the record permissions alone (see the 403
    // above); guides only add a group for whoever already has it.
    const guides = await callerGuides(getGuides, hasPermission);

    if (query.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) {
      return json({
        ...emptyGlobalSearchResults(groups),
        help: guides && [],
      } satisfies SearchResponse);
    }

    try {
      const results = await search(query, groups);
      const help =
        guides &&
        searchGuides(query, guides, {
          surface: "palette",
          limit: HELP_GROUP_LIMIT,
        });
      return json({ ...results, help } satisfies SearchResponse);
    } catch (error) {
      console.error("Error in global search:", error);
      return json({ error: "Search failed." }, 500);
    }
  };
