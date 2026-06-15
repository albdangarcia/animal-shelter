import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envFiles = [
  ".env",
  ".env.development",
  ".env.local",
  ".env.development.local",
];

for (const envFile of envFiles) {
  const envPath = path.join(process.cwd(), envFile);

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}

export const E2E_APP_PORT = process.env.PLAYWRIGHT_APP_PORT ?? "3001";
export const E2E_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${E2E_APP_PORT}`;
export const E2E_POSTGRES_SERVICE_NAME = "postgres-e2e";
export const E2E_DOCKER_PROJECT_NAME = "animal-shelter-playwright";
export const E2E_DOCKER_COMPOSE_FILE = path.join(
  process.cwd(),
  "docker-compose.playwright.yml",
);
console.log("E2E_DOCKER_COMPOSE_FILE:", E2E_DOCKER_COMPOSE_FILE);
export const E2E_POSTGRES_PORT =
  process.env.PLAYWRIGHT_POSTGRES_PORT ?? "55432";
export const E2E_POSTGRES_USER = process.env.POSTGRES_USER ?? "postgres";
export const E2E_POSTGRES_PASSWORD =
  process.env.POSTGRES_PASSWORD ?? "mysecretpassword";
export const E2E_POSTGRES_DB = process.env.POSTGRES_DB ?? "postgres";

const buildDatabaseUrl = () => {
  const username = encodeURIComponent(E2E_POSTGRES_USER);
  const password = encodeURIComponent(E2E_POSTGRES_PASSWORD);
  const database = encodeURIComponent(E2E_POSTGRES_DB);

  return `postgresql://${username}:${password}@127.0.0.1:${E2E_POSTGRES_PORT}/${database}`;
};

export const E2E_DATABASE_URL =
  process.env.PLAYWRIGHT_DATABASE_URL ?? buildDatabaseUrl();

export const getPlaywrightEnv = (): NodeJS.ProcessEnv => {
  const authSecret = process.env.AUTH_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!authSecret) {
    throw new Error(
      "AUTH_SECRET must be set before running Playwright E2E tests.",
    );
  }

  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be set before running Playwright E2E tests.",
    );
  }

  return {
    ...process.env,
    AUTH_SECRET: authSecret,
    ADMIN_PASSWORD: adminPassword,
    DATABASE_URL: E2E_DATABASE_URL,
    BETTER_AUTH_URL: E2E_BASE_URL,
    NEXT_PUBLIC_AUTH_URL: E2E_BASE_URL,
    HOSTNAME: "127.0.0.1",
    PORT: E2E_APP_PORT,
    POSTGRES_HOST: "127.0.0.1",
    POSTGRES_PORT: E2E_POSTGRES_PORT,
    POSTGRES_USER: E2E_POSTGRES_USER,
    POSTGRES_PASSWORD: E2E_POSTGRES_PASSWORD,
    POSTGRES_DB: E2E_POSTGRES_DB,
    PLAYWRIGHT_POSTGRES_USER: E2E_POSTGRES_USER,
    PLAYWRIGHT_POSTGRES_PASSWORD: E2E_POSTGRES_PASSWORD,
    PLAYWRIGHT_POSTGRES_DB: E2E_POSTGRES_DB,
    PLAYWRIGHT_POSTGRES_PORT: E2E_POSTGRES_PORT,
    COMPOSE_PROJECT_NAME: E2E_DOCKER_PROJECT_NAME,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ?? "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
};

