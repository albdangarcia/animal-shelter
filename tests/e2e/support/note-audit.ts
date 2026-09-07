// Shared scaffolding for the three note-audit specs (animals / people-directory /
// partners-directory). Each spec still owns its own `test.use({ storageState })`
// and `beforeAll`, following
// tests/e2e/people-directory/staff-walk-in-adoption-application.spec.ts — this
// module only removes the copy-paste.
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const adminPassword = process.env.ADMIN_PASSWORD;

// One sign-in per spec file, reused as storage state for that file's cases —
// exactly the pattern in
// tests/e2e/people-directory/staff-walk-in-adoption-application.spec.ts. Each
// spec picks its own path so a single-file run never loads another file's
// (possibly stale) state.
export const adminStatePath = (name: string) =>
  path.join(os.tmpdir(), `note-audit-${name}-admin.state.json`);

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

// storageState: undefined so this bootstrap context ignores the file-based
// storageState the spec sets via test.use (which does not exist yet).
export const bootstrapAdminAuth = async (
  browser: Browser,
  storageStatePath: string,
) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the note-audit E2E specs.",
    );
  }
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await signIn(page);
  await context.storageState({ path: storageStatePath });
  await context.close();
};

// react-hook-form applies defaultValues after mount, which can land on top of an
// early fill() and leave values concatenated. Re-fill until the value sticks.
// (Copied from the walk-in adoption spec.)
export const fillStable = async (field: Locator, text: string) => {
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

// Resolve a directory row's detail id by searching and reading the first row's
// link href — the walk-in spec's personIdByName, generalised to any directory.
export const firstRowIdByQuery = async (
  page: Page,
  directoryPath: string,
  query: string,
): Promise<string> => {
  await page.goto(`${directoryPath}?query=${encodeURIComponent(query)}`);
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();
  const href = await firstRow.getByRole("link").first().getAttribute("href");
  if (!href) {
    throw new Error(`No row found in ${directoryPath} for query=${query}`);
  }
  return href.split("/").pop() as string;
};

// A single note row in any of the three note lists. Each note is rendered as
// `<div class="border rounded-lg p-4 relative group">` (person/partner add an
// opacity class for deleted notes) — the `group` + `rounded-lg` pair is stable
// and specific. Narrow by a distinctive substring of the note body.
export const noteCard = (page: Page, contentSubstring: string): Locator =>
  page.locator("div.group.rounded-lg").filter({ hasText: contentSubstring });

// The row-menu trigger only answers to an accessible name because of the
// sr-only "Note actions" span. The button sits in an `opacity-0
// group-hover:opacity-100` wrapper, so hover the card first; Radix also
// occasionally drops the first click before hydration settles, and re-clicking
// an open menu would toggle it shut — so re-click only when it is closed.
export const openNoteEditDialog = async (page: Page, card: Locator) => {
  await expect(card).toHaveCount(1);
  await card.hover();
  const trigger = card.getByRole("button", { name: /note actions/i });
  const editItem = page.getByRole("menuitem", { name: "Edit" });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await editItem.isVisible())) {
      await trigger.click();
    }
    await expect(editItem).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await editItem.click();
  await expect(page.getByRole("heading", { name: "Edit Note" })).toBeVisible();
};
