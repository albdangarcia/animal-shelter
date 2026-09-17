import { getCachedSession } from "@/app/lib/auth/session";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { searchEverything } from "@/app/lib/data/search/global-search.data";
import { createSearchHandler } from "./search-handler";

// A route handler rather than a server action: server actions run one at a
// time and can't be aborted, which search-as-you-type needs.
export const GET = createSearchHandler({
  getSession: getCachedSession,
  hasPermission,
  search: searchEverything,
});
