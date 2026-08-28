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

/**
 * True when a Postgres connection URL points at a loopback or private-network
 * host — a local container or dev box, never a shared database that could hold
 * real records.
 *
 * This is the single fact the AI provider's free-tier guard trusts (see
 * `app/lib/ai/provider-guard.ts`). It is derived from the connection URL the
 * app actually runs against, so — unlike a separate `IS_DEMO`-style flag —
 * there is no way to point the app at a production database and still have the
 * guard treat it as safe.
 *
 * Unparseable input returns `false` (fail closed). "Private" here means:
 * `localhost`, the IPv4 loopback (`127/8`) and unspecified (`0.0.0.0`)
 * addresses, IPv6 loopback (`::1`), RFC 1918 ranges (`10/8`, `172.16/12`,
 * `192.168/16`), mDNS `.local` names, and bare single-label hostnames such as
 * the `postgres` / `db` service names Docker Compose resolves on its own
 * bridge network.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;

  // For non-special schemes (`postgresql:`), `new URL` keeps the brackets on a
  // literal IPv6 host — normalize `[::1]` down to `::1`.
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host === "::1") return true;
  if (host === "localhost" || host === "0.0.0.0") return true;
  if (host.endsWith(".local")) return true;

  // Bare hostname with no dots — a Docker Compose service name or similar,
  // not a publicly routable host. (IPv6 addresses contain colons and are
  // handled above / below, so a colon-free, dot-free token is a short name.)
  if (!host.includes(".") && !host.includes(":")) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const first = Number(ipv4[1]);
    const second = Number(ipv4[2]);
    if (first === 127 || first === 10) return true;
    if (first === 192 && second === 168) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
  }

  return false;
}
