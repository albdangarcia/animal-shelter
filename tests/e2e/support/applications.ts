import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Every seeded account except admin@example.com shares this password
// (prisma/seed.ts, `seedPersonsAndUsers`).
export const SEEDED_USER_PASSWORD = "7dJbys5@?tMA";

// The registered user who holds the ten hand-seeded adoption application
// fixtures — one per status, plus the second CLOSED one on a returned animal.
// `seedRegisteredUserApplicationFixtures` keeps her out of every random
// applicant pool, so these are the whole of what she has.
export const APPLICANT_EMAIL = "surrenderer1@example.com";
export const APPLICANT_NAME = "Jane Doe";

export const MY_APPLICATIONS_PATH = "/dashboard/my-adoption-applications";

export const signIn = async (page: Page, email: string, password: string) => {
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent("/dashboard")}`);
  const credentialsForm = page
    .locator("form")
    .filter({ has: page.getByLabel(/email address/i) });
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await credentialsForm.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
};

export const storageStatePathFor = (fileName: string) =>
  path.join(os.tmpdir(), fileName);

/**
 * One sign-in per spec file, reused as storage state.
 *
 * The better-auth sign-in endpoint rate-limits after a few hits inside a
 * minute, and these files have more cases than that budget — signing in per
 * test would flake. `storageState: undefined` on the bootstrap context is what
 * stops it trying to load the file `test.use` points at, which does not exist
 * on the first run.
 */
export const bootstrapStorageState = async (
  browser: Browser,
  {
    email,
    password,
    storageStatePath,
  }: { email: string; password: string; storageStatePath: string },
) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await signIn(page, email, password);
  await context.storageState({ path: storageStatePath });
  await context.close();
};

// waitForURL's glob treats `*` as "not across /", so a `?*` tail never matches
// a query string that itself contains slashes. Match on the pathname instead.
export const waitForPathname = (page: Page, pathname: string | RegExp) =>
  page.waitForURL(
    (url) =>
      typeof pathname === "string"
        ? url.pathname === pathname
        : pathname.test(url.pathname),
    { timeout: 60_000 },
  );

// react-hook-form applies its defaultValues after mount, which can land on top
// of an early fill() and leave a prefilled value concatenated to ours. Re-fill
// until the value sticks.
export const fillStable = async (field: Locator, text: string) => {
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

/**
 * Open one table row's Radix dropdown and return the href of a menu item.
 *
 * The trigger occasionally swallows the first click right after a navigation,
 * before hydration settles — so retry, re-clicking only when the menu is
 * actually closed so we never toggle it shut. The item is a
 * `<Link><DropdownMenuItem/></Link>`, so the href lives on the anchor that
 * wraps it, not on the menuitem.
 */
export const rowMenuItemHref = async (
  page: Page,
  rowIndex: number,
  itemName: string,
) => {
  const trigger = page
    .locator("tbody tr")
    .nth(rowIndex)
    .getByRole("button", { name: "Open menu" });
  const item = page.getByRole("menuitem", { name: itemName });

  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await item.isVisible())) {
      await trigger.click();
    }
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  const href = await page
    .locator("a", { has: item })
    .first()
    .getAttribute("href");
  if (!href) {
    throw new Error(`Row ${rowIndex} has no "${itemName}" link.`);
  }
  // Close the menu so the next row's trigger is not covered by the overlay.
  await page.keyboard.press("Escape");
  return href;
};
