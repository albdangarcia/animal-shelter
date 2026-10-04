/**
 * `npm run test:db` — runs the tests that need a real Postgres
 * (`prisma/**​/*.test.ts`), or only the files named after `--`:
 * `npm run test:db -- prisma/outcome-reversal.test.ts`.
 *
 * They create, mutate, and delete real rows, because what is under test is
 * what the database actually does — the unique indexes, the query
 * extensions, the locks and transactions, and the rows and audit records a
 * write leaves behind.
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
 * `PLAYWRIGHT_DATABASE_URL` in the environment points the tests elsewhere (a
 * value in a `.env*` file wins over the shell's: `playwright/env.ts` loads
 * them with `override`).
 *
 * The tests get a minimal environment, as in CI, where there is no `.env`:
 * `PLAYWRIGHT_DATABASE_URL`, what is needed to find and run Node, and `TERM`,
 * not this process's environment. Importing `playwright/env.ts` loads `.env*`
 * into `process.env`, and passing that on would let a test pass here that
 * fails in CI: one that imports the auth setup (BetterAuth refuses an empty
 * `BETTER_AUTH_ALLOWED_HOSTS`), or one that leans on `SHELTER_TIMEZONE`.
 * `NODE_OPTIONS` stays out, because a preload such as
 * `--require=dotenv/config` would load `.env` again; for the same reason tsx
 * runs on this Node directly, not through `npx`, which rebuilds `NODE_OPTIONS`
 * from a `node-options` line in an `.npmrc`. `DATABASE_URL` and
 * `DATABASE_URL_UNPOOLED` stay out too: CI does not set them, and
 * `resolveDatabaseUrl()` prefers `PLAYWRIGHT_DATABASE_URL` in both modes.
 * The `docker compose` and `prisma db push` children keep the full
 * environment: the compose file reads `PLAYWRIGHT_POSTGRES_*`, and `db push`
 * needs the database URLs.
 *
 * File arguments are checked before Docker starts: each must be the path of an
 * existing file, made only of letters, digits, `_`, `.`, `-`, `/` and spaces.
 * Node's runner reads every argument as a glob, extended globs such as
 * `@(a)` included, and passes a glob that matches nothing with "tests 0".
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
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

// For the `tsx --test` child only. Each name is copied only if set:
// VOLTA_HOME because a custom Volta install is not found through PATH alone,
// TERM because without it Node prints the test report without colour.
const passThrough = [
  "PATH",
  "HOME",
  "USER",
  "TMPDIR",
  "LANG",
  "TERM",
  "VOLTA_HOME",
];
const testEnv: Record<string, string | undefined> = {
  PLAYWRIGHT_DATABASE_URL: TEST_DB_DATABASE_URL,
};
for (const name of passThrough) {
  if (process.env[name] !== undefined) testEnv[name] = process.env[name];
}

const fileArgs = process.argv.slice(2);
const refused = fileArgs.filter(
  (arg) =>
    arg.startsWith("-") ||
    !/^[\w./ -]+$/.test(arg) ||
    !fs.statSync(arg, { throwIfNoEntry: false })?.isFile(),
);
if (refused.length > 0) {
  for (const arg of refused) {
    console.error(`test:db: not a plain path to an existing file: ${arg}`);
  }
  console.error(
    "Name test files by path, e.g. npm run test:db -- prisma/outcome-reversal.test.ts",
  );
  process.exit(1);
}

const run = (
  command: string,
  args: string[],
  childEnv: NodeJS.ProcessEnv,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: childEnv,
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
  await run(
    "docker",
    [
      "compose",
      "-p",
      TEST_DB_DOCKER_PROJECT_NAME,
      "-f",
      E2E_DOCKER_COMPOSE_FILE,
      "up",
      "-d",
      "--wait",
    ],
    env,
  );
  await run("npx", ["prisma", "db", "push"], env);
  await run(
    process.execPath,
    [
      // From the checkout, not `require`, so it works whether this file runs
      // as CommonJS or as an ES module.
      createRequire(path.join(process.cwd(), "package.json")).resolve(
        "tsx/cli",
      ),
      "--test",
      ...(fileArgs.length > 0 ? fileArgs : ["prisma/**/*.test.ts"]),
    ],
    // No NODE_ENV, as in CI; Next's ProcessEnv type declares it required.
    testEnv as NodeJS.ProcessEnv,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
