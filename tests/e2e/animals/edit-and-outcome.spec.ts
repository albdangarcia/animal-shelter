import { test, expect, type Locator, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const adminPassword = process.env.ADMIN_PASSWORD;

// One sign-in for the whole file, reused as storage state. The better-auth
// sign-in endpoint rate-limits after a few hits inside a minute, and this spec
// has more cases than that budget — logging in per test would flake.
const storageStatePath = path.join(os.tmpdir(), "animal-edit-admin.state.json");

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
      "ADMIN_PASSWORD must be available to run the animal edit E2E spec.",
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

// Archived and pending-adoption animals are seeded with random names, so they
// can't be hardcoded. The dashboard animals table's listing-status filter is
// stable across reseeds — reach one through it and take the first row.
const firstAnimalIdByStatus = async (page: Page, status: string) => {
  await page.goto(`/dashboard/animals?listingStatus=${status}&pageSize=10`);
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();
  const href = await firstRow.getByRole("link").first().getAttribute("href");
  if (!href) {
    throw new Error(`No animal row found for listingStatus=${status}`);
  }
  return href.split("/").pop() as string;
};

// react-hook-form applies its defaultValues after mount, which can land on top
// of an early fill() and leave the seed description concatenated to ours. Re-fill
// until the value sticks.
const fillStable = async (field: Locator, text: string) => {
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

const saveDescription = async (page: Page, animalId: string, text: string) => {
  await page.goto(`/dashboard/animals/${animalId}/edit`);
  const description = page.getByLabel("Description");
  await expect(description).toBeVisible();
  await fillStable(description, text);
  await page.getByRole("button", { name: "Save Changes" }).click();
};

const expectDescriptionPersists = async (
  page: Page,
  animalId: string,
  text: string,
) => {
  await expect(page.getByText("Animal updated successfully.")).toBeVisible();
  await page.waitForURL(`**/dashboard/animals/${animalId}`, { timeout: 60_000 });
  await page.goto(`/dashboard/animals/${animalId}/edit`);
  await expect(page.getByLabel("Description")).toHaveValue(text);
};

test("an archived animal's description can be edited and persists", async ({
  page,
}) => {
  const animalId = await firstAnimalIdByStatus(page, "ARCHIVED");
  const description = `Archived edit check ${Date.now()}`;
  await saveDescription(page, animalId, description);
  await expectDescriptionPersists(page, animalId, description);
});

test("a pending-adoption animal's description can be edited and persists", async ({
  page,
}) => {
  // This is the case that regressed silently — it matters as much as the
  // archived one.
  const animalId = await firstAnimalIdByStatus(page, "PENDING_ADOPTION");
  const description = `Pending-adoption edit check ${Date.now()}`;
  await saveDescription(page, animalId, description);
  await expectDescriptionPersists(page, animalId, description);
});

test("the listing status select is disabled and pinned to the current value for locked statuses", async ({
  page,
}) => {
  for (const [status, label] of [
    ["ARCHIVED", "Archived"],
    ["PENDING_ADOPTION", "Pending Adoption"],
  ] as const) {
    const animalId = await firstAnimalIdByStatus(page, status);
    await page.goto(`/dashboard/animals/${animalId}/edit`);
    const statusSelect = page.getByLabel("Listing Status", { exact: true });
    await expect(statusSelect).toBeVisible();
    await expect(statusSelect).toBeDisabled();
    // A disabled select showing only this label offers no other value.
    await expect(statusSelect).toContainText(label);
  }
});

test("an in-care animal's ordinary edit still saves", async ({ page }) => {
  // Guard against over-correcting the fix: normal edits must keep working.
  const animalId = await firstAnimalIdByStatus(page, "PUBLISHED");
  const description = `Published edit check ${Date.now()}`;
  await saveDescription(page, animalId, description);
  await expectDescriptionPersists(page, animalId, description);
});

test("saving an archived animal's edit form leaves its listing status archived", async ({
  page,
}) => {
  const animalId = await firstAnimalIdByStatus(page, "ARCHIVED");
  await saveDescription(
    page,
    animalId,
    `Archived status immutability ${Date.now()}`,
  );
  await expect(page.getByText("Animal updated successfully.")).toBeVisible();
  await page.waitForURL(`**/dashboard/animals/${animalId}`, { timeout: 60_000 });

  // The form exposes no path to a different status; the save above left it
  // archived. The status filter still returns it and the edit form still
  // badges it Archived.
  const stillArchived = await firstAnimalIdByStatus(page, "ARCHIVED");
  expect(stillArchived).toBe(animalId);
  await page.goto(`/dashboard/animals/${animalId}/edit`);
  await expect(page.getByLabel("Listing Status", { exact: true })).toContainText("Archived");
});

test("an archived animal's edit form disables the location and unit cascade", async ({
  page,
}) => {
  const animalId = await firstAnimalIdByStatus(page, "ARCHIVED");
  await page.goto(`/dashboard/animals/${animalId}/edit`);
  await expect(page.getByLabel("Location", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Unit", { exact: true })).toBeDisabled();
});

test("processing an outcome releases the animal from its kennel", async ({
  page,
}) => {
  // Frisco is a stable, seeded long-stay dog housed in "Dog block A · A-1".
  await page.goto("/dashboard/animals?query=Frisco");
  const row = page.locator("tbody tr").filter({ hasText: "Frisco" }).first();
  await expect(row).toBeVisible();
  const href = await row.getByRole("link").first().getAttribute("href");
  const animalId = (href as string).split("/").pop() as string;

  const locationRow = page
    .locator("div.text-sm")
    .filter({ has: page.getByText("Location", { exact: true }) })
    .first();

  // Starting placement, confirmed on the profile.
  await page.goto(`/dashboard/animals/${animalId}`);
  await expect(locationRow).toContainText("Dog block A · A-1");

  // Process a deceased outcome — needs no partner or owner.
  await page.goto(`/dashboard/outcomes/create?animalId=${animalId}`);
  await page.getByLabel("Outcome Type").click();
  await page.getByRole("option", { name: "Deceased" }).click();
  await page.getByRole("button", { name: "Process Outcome" }).click();
  await page.waitForURL("**/dashboard/outcomes", { timeout: 60_000 });

  // The animal has left the shelter: its profile shows no kennel...
  await page.goto(`/dashboard/animals/${animalId}`);
  await expect(locationRow).toContainText("Unplaced");
  await expect(locationRow).not.toContainText("Dog block A");

  // ...and it is gone from the shelter board's unit tile.
  await page.goto("/dashboard/locations");
  await expect(page.getByText("Frisco", { exact: true })).toHaveCount(0);
});
