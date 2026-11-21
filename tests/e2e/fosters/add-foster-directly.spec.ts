import { test, expect, type Page } from "@playwright/test";
import { storageStatePathFor } from "../support/applications";

const adminPassword = process.env.ADMIN_PASSWORD;

// One sign-in for the whole file, reused as storage state — the better-auth
// sign-in endpoint rate-limits after a few hits inside a minute.
const storageStatePath = storageStatePathFor("add-foster-admin.state.json");

test.describe.configure({ mode: "serial" });

const signIn = async (page: Page) => {
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent("/dashboard")}`);
  const credentialsForm = page
    .locator("form")
    .filter({ has: page.getByLabel(/email address/i) });
  await page.getByLabel(/email address/i).fill("admin@example.com");
  await page.getByLabel(/^password$/i).fill(adminPassword!);
  await credentialsForm.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
};

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the add-foster E2E spec.",
    );
  }
  // storageState: undefined so this bootstrap context ignores the file-based
  // storageState set by test.use below (which does not exist yet).
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await signIn(page);
  await context.storageState({ path: storageStatePath });
  await context.close();
});

test.use({ storageState: storageStatePath });

// "Sam Duplicate" is a seeded walk-in (no account) that prisma/seed.ts keeps
// out of every applicant and foster pool, so she has no foster profile and her
// Fostering tab starts on the "Add as Foster" empty state. Found through the
// people directory rather than by a hardcoded id.
const personIdByName = async (page: Page, name: string) => {
  await page.goto(
    `/dashboard/people-directory?query=${encodeURIComponent(name)}`,
  );
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();
  const href = await firstRow.getByRole("link").first().getAttribute("href");
  if (!href) throw new Error(`No person row found for query=${name}`);
  return href.split("/").pop() as string;
};

test("Create Foster Profile with no person picked says to pick one", async ({
  page,
}) => {
  await page.goto("/dashboard/fosters/new");
  await page.getByRole("button", { name: "Create Foster Profile" }).click();

  await expect(page.getByText("Pick a person.")).toBeVisible();
  await expect(page.getByText(/Invalid ID format/)).toHaveCount(0);
  // Nothing was created, so the form is still open.
  await expect(page).toHaveURL(/\/dashboard\/fosters\/new$/);
});

test("Add as Foster on a person's Fostering tab returns to that tab after Create Foster Profile", async ({
  page,
}) => {
  const personId = await personIdByName(page, "Sam Duplicate");
  const fosteringTab = `/dashboard/people-directory/${personId}/fostering`;

  await page.goto(fosteringTab);
  await page.getByRole("link", { name: "Add as Foster" }).click();
  await page.waitForURL(
    (url) => url.pathname === "/dashboard/fosters/new",
    { timeout: 60_000 },
  );

  await page.getByRole("combobox", { name: /species you can foster/i }).click();
  await page.getByRole("option").first().click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Create Foster Profile" }).click();

  await page.waitForURL((url) => url.pathname === fosteringTab, {
    timeout: 60_000,
  });
  // The tab shows the new profile, not the empty state or a blank page.
  await expect(page.getByText("Foster Status")).toBeVisible();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(/They have no foster profile yet/),
  ).toHaveCount(0);
});
