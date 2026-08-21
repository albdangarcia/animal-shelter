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
  candidate &&
  candidate.startsWith("/") &&
  !candidate.startsWith("//") &&
  !candidate.startsWith("/\\")
    ? candidate
    : fallback;