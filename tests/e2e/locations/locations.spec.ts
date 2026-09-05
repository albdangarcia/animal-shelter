import { test, expect, type Locator, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const adminPassword = process.env.ADMIN_PASSWORD;
const locationsPath = "/dashboard/settings/locations";

// One sign-in for the whole file, reused as storage state. The better-auth
// sign-in endpoint rate-limits after a few hits inside a minute, and this spec
// has more cases than that budget — logging in per test would flake.
const storageStatePath = path.join(os.tmpdir(), "locations-admin.state.json");

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
      "ADMIN_PASSWORD must be available to run the locations E2E spec.",
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

// react-hook-form applies its defaultValues after mount, which can land on
// top of an early fill() and leave a stale value behind. Re-fill until it
// sticks, matching the pattern used in the household-edit spec.
const fillStable = async (field: Locator, text: string) => {
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

// The location's own card. Scoped by the exact classes LocationBlock renders
// on its outer wrapper, filtered down to the one containing this name.
const locationCard = (page: Page, name: string) =>
  page
    .locator("div.border.rounded-lg.p-4.bg-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });

// Both the location's "..." menu and every unit chip's "..." menu render as
// aria-haspopup="menu" (Radix DropdownMenuTrigger); Add Unit is a dialog
// trigger (aria-haspopup="dialog"), so this selector only ever matches menus.
// The location's own menu is always first in DOM order, before any units.
const locationMenuButton = (card: Locator) =>
  card.locator('button[aria-haspopup="menu"]').first();

const locationName = `E2E Location ${Date.now()}`;
const unitName = `E2E Unit ${Date.now()}`;

test("admin can create a location", async ({ page }) => {
  await page.goto(locationsPath);
  await page.getByRole("button", { name: "Add Location" }).click();

  await fillStable(page.getByLabel("Name", { exact: true }), locationName);
  await page.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Isolation", exact: true }).click();
  await page
    .getByRole("button", { name: "Create Location", exact: true })
    .click();

  await expect(
    page.getByText("Location created successfully."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: locationName, exact: true }),
  ).toBeVisible();
});

test("admin can add a unit to the new location", async ({ page }) => {
  await page.goto(locationsPath);
  const card = locationCard(page, locationName);

  // An empty location renders two "Add Unit" triggers (header + empty-state
  // link) — either opens the same dialog, so .first() is enough.
  await card.getByRole("button", { name: "Add Unit" }).first().click();
  await fillStable(page.getByLabel("Name", { exact: true }), unitName);
  await fillStable(page.getByLabel("Capacity", { exact: true }), "2");
  await page
    .getByRole("button", { name: "Create Unit", exact: true })
    .click();

  await expect(page.getByText("Unit created successfully.")).toBeVisible();
  await expect(card.getByText(`${unitName} · cap 2`)).toBeVisible();
});

test("a location with units cannot be deleted", async ({ page }) => {
  await page.goto(locationsPath);
  const card = locationCard(page, locationName);

  await locationMenuButton(card).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(
    page.getByText(
      "Can't delete this location while it still has units. Delete or move its units first.",
    ),
  ).toBeVisible();
  // Still active — no Deleted badge on the card.
  await expect(card.getByText("Deleted")).not.toBeVisible();
});

test("removing the unit then deleting the location succeeds", async ({
  page,
}) => {
  await page.goto(locationsPath);
  const card = locationCard(page, locationName);

  // The unit's own menu is the second aria-haspopup="menu" button in the
  // card (the first is the location's), since this location has exactly one
  // unit at this point.
  const unitMenuButton = card.locator('button[aria-haspopup="menu"]').nth(1);
  await unitMenuButton.click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Unit deleted successfully.")).toBeVisible();
  // The unit itself still shows (units aren't filtered out of the location
  // view the way deleted locations are), just marked as Deleted — that's
  // what unblocks the location delete below (it only counts non-deleted units).
  await expect(card.getByText(unitName)).toBeVisible();
  await expect(card.getByText("Deleted")).toBeVisible();

  await locationMenuButton(card).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(
    page.getByText("Location deleted successfully."),
  ).toBeVisible();

  // Default view is active-only: the now-deleted location drops out of it.
  await expect(
    page.getByRole("heading", { name: locationName, exact: true }),
  ).not.toBeVisible();
});

test("the deleted location only shows under the Deleted status filter, and can't receive new units", async ({
  page,
}) => {
  await page.goto(locationsPath);
  await expect(
    page.getByRole("heading", { name: locationName, exact: true }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Status" }).click();
  await page.getByRole("option", { name: "Deleted", exact: true }).click();
  await page.keyboard.press("Escape");

  const card = locationCard(page, locationName);
  await expect(card).toBeVisible();
  // Both the location and its already-deleted unit carry a "Deleted" badge.
  await expect(card.getByText("Deleted").first()).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Add Unit" }).first(),
  ).toBeDisabled();
});

test("selecting both Active and Deleted shows all locations", async ({
  page,
}) => {
  await page.goto(`${locationsPath}?status=active%2Cdeleted`);

  await expect(
    page.getByRole("heading", { name: locationName, exact: true }),
  ).toBeVisible();
  // A location seeded active all along should still show up alongside it.
  await expect(
    page.getByRole("heading", { name: "Cat room", exact: true }),
  ).toBeVisible();
});
