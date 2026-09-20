import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/auth";

// one cached session read, shared by withAuthenticatedUser and
// hasPermission. React `cache()` here is keyed on zero arguments, so every
// caller within a request converges on the same DB read regardless of how
// many times, or for which permission, it's invoked.
//
// A deactivated account has no session as far as the app is concerned. Its
// sessions are deleted when it is deactivated and a new one cannot be created,
// so this only ever fires for a request that was already past both — the one
// in flight when an admin deactivates the account, or a session written by
// something that bypassed the sign-in hook. Returning null rather than the
// session is what makes every caller treat it as signed out: there is no
// middleware in this repo, so this is the single place all authenticated
// surfaces (pages, actions and the API routes) get their session from.
// `deactivatedAt` rides on the session's user, so the check costs no query.
export const getCachedSession = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user.deactivatedAt) return null;
  return session;
});
