/**
 * `npm run test:db` — runs the tests that need a real Postgres
 * (`prisma/**​/*.test.ts`: the query-extension tests
 * `extension-phone.test.ts` and `extension-email.test.ts`,
 * `user-person-sync.test.ts`, `person-account-unlink.test.ts`,
 * `user-deactivation.test.ts`, and `session-deactivation.test.ts`).
 *
 * They create, mutate, and delete `Person` (and `User`) rows, because what is
 * under test is what the unique indexes and the stored rows actually do —
 * whether the normalization extensions fire on raw client calls, whether the
 * Person/User contact sync holds, where the rows end up when an account is
 * moved off the record it was wrongly linked to, and whether deactivating one
 * really sets the column, revokes the sessions and refuses the next sign-in.
 * This script points them at a throwaway docker-compose container of their
 * own, and NEVER the dev database. It is not the container `npm run e2e`
 * provisions: each checkout has one of each, on its own ports (see
 * `app/lib/test-harness-coordinates.ts`), so test:db can run while e2e does,
 * in one worktree or in several. The previous script had a `dotenv -e
 * .env.local -e .env.development -e .env` prefix, so it resolved to whatever
 * `.env*` held (i.e. dev) and wrote to / deleted from it.
 *
 * Requires Docker with `docker compose` — already a requirement for
 * `npm run e2e`. `docker compose ... up -d --wait` is idempotent, so this is a
 * no-op when the container is already running. The container is left up
 * afterwards, the same way CI's `db-tests` job leaves it, so the next run
 * skips the start-up; `docker compose -p <project> down -v` removes it (the
 * project name is in the first line this script logs).
 *
 * Mirrors the steps of CI's `db-tests` job (`.github/workflows/ci.yml`):
 * compose up --wait → `prisma db push` → `tsx --test`. CI's job uses the e2e
 * project and port directly; that is safe there because each job has its own
 * VM. The connection string and compose coordinates are imported from
 * `playwright/env.ts` so there is one source of truth; setting
 * `PLAYWRIGHT_DATABASE_URL` in the environment points the tests elsewhere.
 */
import { spawn } from "node:child_process";
import {
  describeHarness,
  E2E_DOCKER_COMPOSE_FILE,
  E2E_POSTGRES_DB,
  E2E_POSTGRES_PASSWORD,
  E2E_POSTGRES_USER,
  TEST_DB_DATABASE_URL,
  TEST_DB_DOCKER_PROJECT_NAME,
  TEST_DB_POSTGRES_PORT,
} from "@/playwright/env";

const env: NodeJS.ProcessEnv = {
  ...process.env,
  PLAYWRIGHT_DATABASE_URL: TEST_DB_DATABASE_URL,
  // Pinned too, as getPlaywrightEnv() does for e2e, so nothing that bypasses
  // the override can fall back to .env's dev database.
  DATABASE_URL: TEST_DB_DATABASE_URL,
  DATABASE_URL_UNPOOLED: TEST_DB_DATABASE_URL,
  // Read by docker-compose.playwright.yml.
  PLAYWRIGHT_POSTGRES_PORT: TEST_DB_POSTGRES_PORT,
  PLAYWRIGHT_POSTGRES_USER: E2E_POSTGRES_USER,
  PLAYWRIGHT_POSTGRES_PASSWORD: E2E_POSTGRES_PASSWORD,
  PLAYWRIGHT_POSTGRES_DB: E2E_POSTGRES_DB,
};

const run = (command: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} → ${signal ?? `exit ${code}`}`,
        ),
      );
    });
  });

async function main() {
  console.log(
    `test:db harness: ${describeHarness(TEST_DB_DOCKER_PROJECT_NAME, TEST_DB_DATABASE_URL)}`,
  );
  await run("docker", [
    "compose",
    "-p",
    TEST_DB_DOCKER_PROJECT_NAME,
    "-f",
    E2E_DOCKER_COMPOSE_FILE,
    "up",
    "-d",
    "--wait",
  ]);
  await run("npx", ["prisma", "db", "push"]);
  await run("npx", ["tsx", "--test", "prisma/**/*.test.ts"]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
