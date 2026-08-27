import type { FullConfig } from "@playwright/test";
import {
  E2E_DOCKER_COMPOSE_FILE,
  E2E_DOCKER_PROJECT_NAME,
  E2E_POSTGRES_DB,
  E2E_POSTGRES_SERVICE_NAME,
  E2E_POSTGRES_USER,
  getPlaywrightEnv,
} from "./env";
import { runCommand } from "./process";

console.log("global-setup.ts, E2E_DOCKER_COMPOSE_FILE:", E2E_DOCKER_COMPOSE_FILE);
console.log("global-setup.ts, E2E_DOCKER_PROJECT_NAME:", E2E_DOCKER_PROJECT_NAME);
console.log("global-setup.ts, E2E_POSTGRES_DB:", E2E_POSTGRES_DB);
console.log("global-setup.ts, E2E_POSTGRES_SERVICE_NAME:", E2E_POSTGRES_SERVICE_NAME);
console.log("global-setup.ts, E2E_POSTGRES_USER:", E2E_POSTGRES_USER);

const resetDatabase = async (env: NodeJS.ProcessEnv) => {
  await runCommand(
    "docker",
    [
      "compose",
      "-p",
      E2E_DOCKER_PROJECT_NAME,
      "-f",
      E2E_DOCKER_COMPOSE_FILE,
      "exec",
      "-T",
      E2E_POSTGRES_SERVICE_NAME,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      E2E_POSTGRES_USER,
      "-d",
      E2E_POSTGRES_DB,
      "-c",
      "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
    ],
    { env },
  );
};

export default async function globalSetup(_config: FullConfig) {
  const env = getPlaywrightEnv();

  console.log("Starting Playwright PostgreSQL container...");
  await runCommand(
    "docker",
    [
      "compose",
      "-p",
      E2E_DOCKER_PROJECT_NAME,
      "-f",
      E2E_DOCKER_COMPOSE_FILE,
      "up",
      "-d",
      "--wait",
      "--remove-orphans",
    ],
    { env },
  );

  console.log("Resetting Playwright PostgreSQL schema...");
  await resetDatabase(env);

  console.log("Generating Prisma client for Playwright E2E tests...");
  await runCommand("npx", ["prisma", "generate"], { env });

  console.log("Applying Prisma schema to Playwright database...");
  await runCommand("npx", ["prisma", "db", "push"], { env });

  console.log("Seeding Playwright database...");
  await runCommand("npx", ["prisma", "db", "seed"], {
    env: {
      ...env,
      PRISMA_SEEDING: "true",
    },
  });
}

