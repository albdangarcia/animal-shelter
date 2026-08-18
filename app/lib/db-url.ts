/**
 * Single source of truth for resolving the Postgres connection URL.
 *
 * Imported by app/lib/prisma.ts (Next runtime), prisma.config.ts and
 * prisma/seed.ts (plain tsx, outside Next). Previously each of those three
 * implemented its own ?? chain, which drifted apart and made the e2e
 * DATABASE_URL override unreachable.
 *
 * Modes are NOT interchangeable:
 *   "pooled" — the running app. Must use the Neon pooler in production.
 *   "direct" — migrations and seeding. Must use a direct (unpooled) connection.
 *
 * PLAYWRIGHT_DATABASE_URL is checked first in both modes. It is set only by
 * playwright/env.ts, so the e2e harness wins deterministically without
 * reversing the production-correct Neon ordering, and without depending on
 * POSTGRES_URL being absent.
 */
export type DatabaseUrlMode = "pooled" | "direct";

export function resolveDatabaseUrl(
  mode: DatabaseUrlMode,
  env: Partial<Record<string, string | undefined>> = process.env,
): string {
  // e2e override — always wins when set.
  if (env.PLAYWRIGHT_DATABASE_URL) return env.PLAYWRIGHT_DATABASE_URL;

  const candidates =
    mode === "direct"
      ? [
          env.DATABASE_URL_UNPOOLED,
          env.POSTGRES_URL_NON_POOLING,
          env.POSTGRES_URL,
          env.DATABASE_URL,
        ]
      : [env.POSTGRES_URL, env.DATABASE_URL];

  const url = candidates.find((value) => typeof value === "string" && value !== "");

  if (!url) {
    throw new Error(
      `Missing database URL (mode: ${mode}). Set PLAYWRIGHT_DATABASE_URL, ` +
        (mode === "direct"
          ? "DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING, POSTGRES_URL, or DATABASE_URL."
          : "POSTGRES_URL, or DATABASE_URL."),
    );
  }

  return url;
}
