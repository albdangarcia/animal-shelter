/**
 * `npm run test:db` — runs the Prisma query-extension tests
 * (`prisma/**​/*.test.ts`, currently just `extension-phone.test.ts`).
 *
 * Those tests need a real Postgres: they create, mutate, and delete a `Person`
 * row to prove the phone-normalization extension fires on raw client calls.
 * This script points them at the throwaway docker-compose container on port
 * 55432 — the same database `npm run e2e` provisions — and NEVER the dev
 * database. The previous script had a `dotenv -e .env.local -e .env.development
 * -e .env` prefix, so it resolved to whatever `.env*` held (i.e. dev) and wrote
 * to / deleted from it.
 *
 * Requires Docker with `docker compose` — already a requirement for
 * `npm run e2e`. `docker compose ... up -d --wait` is idempotent, so this is a
 * no-op when the container is already running. The container is left up
 * afterwards, the same way CI's `e2e` job leaves it; `npm run e2e`'s
 * global-teardown is what tears it down (`docker compose down -v`).
 *
 * Mirrors the Prisma-test steps of CI's `e2e` job (`.github/workflows/ci.yml`):
 * compose up --wait → `prisma db push` → `tsx --test`. The connection string
 * and compose coordinates are imported from `playwright/env.ts` so there is one
 * source of truth; setting `PLAYWRIGHT_DATABASE_URL` in the environment
 * overrides the default there and here alike.
 */
import { spawn } from "node:child_process";
import {
  E2E_DATABASE_URL,
  E2E_DOCKER_COMPOSE_FILE,
  E2E_DOCKER_PROJECT_NAME,
} from "@/playwright/env";

const run = (command: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, PLAYWRIGHT_DATABASE_URL: E2E_DATABASE_URL },
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
  await run("docker", [
    "compose",
    "-p",
    E2E_DOCKER_PROJECT_NAME,
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
