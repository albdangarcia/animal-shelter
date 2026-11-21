// Open-redirect guard for caller-supplied navigation targets.
//
// Every action that accepts a `returnTo` / `callbackUrl` takes it from the URL
// and hands it back to the client as `redirectTo`. The client is not the
// boundary: these actions are reachable by direct POST, so the check has to
// live server-side, and it has to live in one place — it is needed by
// person, partner, outcome, and adoption-application actions.

/**
 * Returns `candidate` only when it is a safe same-origin path, otherwise
 * `fallback`.
 *
 * Rejects anything that isn't rooted at "/" (absolute URLs, `javascript:`),
 * and both spellings of a protocol-relative URL: "//evil.com" and
 * "/\evil.com". The second matters now that the value reaches `router.push`
 * in the browser rather than a server `redirect()` — browsers normalize a
 * backslash in the authority position to a forward slash, so "/\evil.com"
 * navigates off-origin exactly like "//evil.com".
 */
export const safeInternalPath = (
  candidate: string | null | undefined,
  fallback: string,
): string =>
  // `returnTo` is typed as a string but comes from a URL or a direct POST, so
  // a repeated query key (a string[]) or any other value can arrive: refuse
  // it here rather than throw on `.startsWith` after an action has written.
  typeof candidate === "string" &&
  candidate.startsWith("/") &&
  !candidate.startsWith("//") &&
  !candidate.startsWith("/\\")
    ? candidate
    : fallback;

/**
 * Like `safeInternalPath`, but the path must also resolve to a page inside the
 * staff dashboard ("/dashboard/..."). For a `returnTo` that only ever names a
 * dashboard page: a same-origin path outside it (a public page, an API route)
 * is not somewhere a form should send staff.
 *
 * "Resolve" matters: "/dashboard/../api/x" and "/dashboard/%2e%2e/x" start
 * with "/dashboard/" but the browser navigates to "/api/x", so the path is
 * resolved the way the browser will and the result is what is checked.
 */
export const safeDashboardPath = (
  candidate: string | null | undefined,
  fallback: string,
): string => {
  const path = safeInternalPath(candidate, "");
  if (!path) return fallback;
  try {
    const resolved = new URL(path, "http://localhost");
    return resolved.origin === "http://localhost" &&
      resolved.pathname.startsWith("/dashboard/")
      ? path
      : fallback;
  } catch {
    return fallback;
  }
};
