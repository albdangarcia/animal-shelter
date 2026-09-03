import { expect, test } from "@playwright/test";

const adminPassword = process.env.ADMIN_PASSWORD;
const adminDashboardPath = "/dashboard";

test.beforeAll(() => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the seeded admin login test.",
    );
  }
});

test("seeded admin can sign in and reach the dashboard", async ({ page }) => {
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(adminDashboardPath)}`);

  const credentialsForm = page.locator("form").filter({
    has: page.getByLabel(/email address/i),
  });

  await expect(
    page.getByRole("heading", { name: /^sign in$/i }),
  ).toBeVisible();

  await page.getByLabel(/email address/i).fill("admin@example.com");
  await page.getByLabel(/^password$/i).fill(adminPassword!);

  await credentialsForm.getByRole("button", { name: /^sign in$/i }).click();

  await page.waitForURL(`**${adminDashboardPath}`, { timeout: 60_000 });

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test("invalid credentials stay on sign-in and show an error", async ({ page }) => {
  await page.goto("/sign-in");

  const credentialsForm = page.locator("form").filter({
    has: page.getByLabel(/email address/i),
  });

  await page.getByLabel(/email address/i).fill("admin@example.com");
  await page.getByLabel(/^password$/i).fill("wrong-password");
  await credentialsForm
    .getByRole("button", { name: "Sign in", exact: true })
    .click();

  await expect(page).toHaveURL(/\/sign-in(\?|$)/);
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("dashboard redirects logged-out visitors to the sign-in page", async ({ page }) => {
  await page.goto(adminDashboardPath);
  await expect(page).toHaveURL(/\/sign-in(\?|$)/);
});
