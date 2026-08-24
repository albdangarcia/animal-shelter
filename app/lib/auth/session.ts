import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/auth";

// D5a — one cached session read, shared by withAuthenticatedUser and
// hasPermission. React `cache()` here is keyed on zero arguments, so every
// caller within a request converges on the same DB read regardless of how
// many times, or for which permission, it's invoked — see H4.
export const getCachedSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});
