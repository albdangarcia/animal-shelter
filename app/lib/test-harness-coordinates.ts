import { createHash } from "node:crypto";

/**
 * Where a checkout's local test containers and e2e app live, so several git
 * worktrees can run `npm run e2e` and `npm run test:db` at once.
 *
 * The main checkout is slot 0 and keeps the original compose project and
 * Postgres port (CI's clones are slot 0 too). A linked worktree gets a slot
 * from a hash of its path. `E2E_SLOT` overrides the slot, and `E2E_SLOT=0`
 * gives a worktree the main checkout's ports.
 *
 * Empty values count as unset everywhere, matching docker-compose's `:-`
 * defaults. That matters most for PLAYWRIGHT_DATABASE_URL: resolveDatabaseUrl()
 * skips an empty one and falls through to .env's URLs, which point at the dev
 * database.
 *
 * Pure and deterministic on purpose: every Playwright worker re-evaluates the
 * config and has to arrive at the same ports as the main process.
 *
 * Compose project names carry the path hash, not the slot, and every
 * worktree's do, even at slot 0. Two checkouts on the same slot then fail
 * loudly on a busy port, instead of the second `docker compose up` quietly
 * reusing the first one's container and its global setup dropping the schema
 * under the other run. Only the main checkout gets the bare names.
 */

export const MAX_SLOT = 99;

export type SlotSource = "main checkout" | "worktree path" | "E2E_SLOT";

export type HarnessCoordinates = {
  slot: number;
  slotSource: SlotSource;
  /** Both containers' credentials, also passed to docker-compose.playwright.yml. */
  postgres: { user: string; password: string; database: string };
  e2e: {
    projectName: string;
    postgresPort: string;
    appPort: string;
    databaseUrl: string;
  };
  testDb: { projectName: string; postgresPort: string; databaseUrl: string };
};

export type HarnessInput = {
  /** Absolute path of the checkout. */
  root: string;
  /** A linked worktree's `.git` is a file; the main checkout's is a directory. */
  isLinkedWorktree: boolean;
  env: Partial<Record<string, string | undefined>>;
};

export const checkoutId = (root: string) =>
  createHash("sha256").update(root).digest("hex").slice(0, 8);

const resolveSlot = ({
  root,
  isLinkedWorktree,
  env,
}: HarnessInput): Pick<HarnessCoordinates, "slot" | "slotSource"> => {
  const override = env.E2E_SLOT;
  if (override) {
    if (!/^\d+$/.test(override) || Number(override) > MAX_SLOT) {
      throw new Error(
        `E2E_SLOT must be a whole number from 0 to ${MAX_SLOT}, got "${override}".`,
      );
    }
    return { slot: Number(override), slotSource: "E2E_SLOT" };
  }

  if (!isLinkedWorktree) return { slot: 0, slotSource: "main checkout" };

  return {
    slot: 1 + (parseInt(checkoutId(root), 16) % MAX_SLOT),
    slotSource: "worktree path",
  };
};

export function resolveHarnessCoordinates(
  input: HarnessInput,
): HarnessCoordinates {
  const { env } = input;
  const { slot, slotSource } = resolveSlot(input);
  const suffix =
    input.isLinkedWorktree || slot !== 0 ? `-${checkoutId(input.root)}` : "";

  const postgres = {
    user: env.POSTGRES_USER || "postgres",
    password: env.POSTGRES_PASSWORD || "mysecretpassword",
    database: env.POSTGRES_DB || "postgres",
  };
  const databaseUrl = (port: string) => {
    const user = encodeURIComponent(postgres.user);
    const password = encodeURIComponent(postgres.password);
    const database = encodeURIComponent(postgres.database);

    return (
      env.PLAYWRIGHT_DATABASE_URL ||
      `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`
    );
  };

  // 55432 stays for slot 0: CI's jobs hard-code it.
  const e2ePostgresPort =
    env.PLAYWRIGHT_POSTGRES_PORT || String(slot === 0 ? 55432 : 55500 + slot);
  const testDbPostgresPort = String(55600 + slot);

  return {
    slot,
    slotSource,
    postgres,
    e2e: {
      projectName: `animal-shelter-playwright${suffix}`,
      postgresPort: e2ePostgresPort,
      // Above 3001 to 3010, where a second `npm run dev` lands when 3000 is
      // taken (Next retries the next 10 ports when no --port is given).
      appPort: env.PLAYWRIGHT_APP_PORT || String(3100 + slot),
      databaseUrl: databaseUrl(e2ePostgresPort),
    },
    testDb: {
      projectName: `animal-shelter-db-tests${suffix}`,
      postgresPort: testDbPostgresPort,
      databaseUrl: databaseUrl(testDbPostgresPort),
    },
  };
}
