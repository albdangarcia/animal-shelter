import { defineConfig, devices } from "@playwright/test";
import { E2E_APP_PORT, E2E_BASE_URL, getPlaywrightEnv } from "./playwright/env";

const env = Object.fromEntries(
  Object.entries(getPlaywrightEnv()).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  globalSetup: "./playwright/global-setup.ts",
  globalTeardown: "./playwright/global-teardown.ts",
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${E2E_APP_PORT}`,
    url: `${E2E_BASE_URL}/favicon.ico`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});


