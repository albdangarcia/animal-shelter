/**
 * Single source of truth for resolving the Postgres connection URL.
 *
 * Imported by app/lib/prisma.ts (Next runtime), prisma.config.ts and
 * prisma/seed.ts (plain tsx, outside Next). Previously each of those three
 * implemented its own ?? chain, which drifted apart and made the e2e
 * DATABASE_URL override unreachable.
 *
 * Modes are NOT interchangeable:
 *   "pooled" — the running app. Reads DATABASE_URL. Must be the Neon pooler
 *     in production.
 *   "direct" — migrations and seeding. Reads DATABASE_URL_UNPOOLED and throws
 *     if it's absent, rather than falling back to DATABASE_URL: against a
 *     PgBouncer transaction-mode pooler, Prisma Migrate fails outright with
 *     `ERROR: prepared statement "s0" already exists`. Throwing here moves
 *     that failure to a contributor's first local command instead of Vercel
 *     build time.
 *
 * PLAYWRIGHT_DATABASE_URL is checked first in both modes. It is set only by
 * playwright/env.ts, so the e2e harness wins deterministically without
 * reversing the production-correct Neon ordering.
 */
export type DatabaseUrlMode = "pooled" | "direct";

export function resolveDatabaseUrl(
  mode: DatabaseUrlMode,
  env: Partial<Record<string, string | undefined>> = process.env,
): string {
  // e2e override — always wins when set.
  if (env.PLAYWRIGHT_DATABASE_URL) return env.PLAYWRIGHT_DATABASE_URL;

  if (mode === "pooled") {
    const url = env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "Missing database URL (mode: pooled). Set PLAYWRIGHT_DATABASE_URL or DATABASE_URL.",
      );
    }
    return url;
  }

  const url = env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "Missing database URL (mode: direct). direct mode requires DATABASE_URL_UNPOOLED " +
        "(migrations and seeding need an unpooled connection); set it to the same value " +
        "as DATABASE_URL for local Postgres.",
    );
  }
  return url;
}
