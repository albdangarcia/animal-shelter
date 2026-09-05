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
    dotenv.config({ path: envPath, override: true, quiet: true });
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

// better-auth validates `baseURL.allowedHosts` when the instance is built, and
// prisma/seed.ts builds one at module load — so an empty list is a hard crash
// during seeding, not a lazy failure. Locally this arrives from .env; a CI
// checkout has no .env, which is exactly how it slipped through. Pinned here so
// the harness never depends on a file it does not control.
export const E2E_ALLOWED_HOSTS = (() => {
  let host = `127.0.0.1:${E2E_APP_PORT}`;
  try {
    host = new URL(E2E_BASE_URL).host;
  } catch {
    // Keep the derived default when PLAYWRIGHT_BASE_URL is not a valid URL.
  }
  return [host, "127.0.0.1:*", "localhost:*"].join(",");
})();

export const getPlaywrightEnv = (): NodeJS.ProcessEnv => {
  const authSecret = process.env.BETTER_AUTH_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!authSecret) {
    throw new Error(
      "BETTER_AUTH_SECRET must be set before running Playwright E2E tests.",
    );
  }

  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be set before running Playwright E2E tests.",
    );
  }

  return {
    ...process.env,
    BETTER_AUTH_SECRET: authSecret,
    ADMIN_PASSWORD: adminPassword,
    DATABASE_URL: E2E_DATABASE_URL,
    DATABASE_URL_UNPOOLED: E2E_DATABASE_URL,
    PLAYWRIGHT_DATABASE_URL: E2E_DATABASE_URL,
    BETTER_AUTH_URL: E2E_BASE_URL,
    BETTER_AUTH_ALLOWED_HOSTS: E2E_ALLOWED_HOSTS,
    // No spec exercises OAuth, but better-auth builds its provider config at
    // init, so these have to be non-empty. Pinned unconditionally rather than
    // defaulted, so a developer with real credentials in .env runs the same
    // configuration CI does — and no real client id reaches a test run.
    GITHUB_CLIENT_ID: "e2e-placeholder-client-id",
    GITHUB_CLIENT_SECRET: "e2e-placeholder-client-secret",
    GOOGLE_CLIENT_ID: "e2e-placeholder-client-id",
    GOOGLE_CLIENT_SECRET: "e2e-placeholder-client-secret",
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

