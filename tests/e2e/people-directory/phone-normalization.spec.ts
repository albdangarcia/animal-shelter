import { test, expect, type Locator, type Page } from "@playwright/test";
import { storageStatePathFor } from "../support/applications";

const adminPassword = process.env.ADMIN_PASSWORD;

// One sign-in for the whole file, reused as storage state. The better-auth
// sign-in endpoint rate-limits after a few hits inside a minute, and this spec
// has more cases than that budget — logging in per test would flake.
const storageStatePath = storageStatePathFor(
  "phone-normalization-admin.state.json",
);

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
      "ADMIN_PASSWORD must be available to run the phone normalization E2E spec.",
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

// "Alex Duplicate" ((212) 555-0188) and "Sam Duplicate" (212.555.0188) are
// hardcoded in prisma/seed.ts's personData: the same number stored in two
// different formats. Both are in NON_APPLICANT_PERSON_NAMES, so no random
// applicant draw touches them and their contact details hold across reseeds.
//
// The generated walk-in pool uses 212-555-1000 upward (WALK_IN_PERSON_COUNT =
// 50), so nothing else in the database normalizes to +12125550188 and the
// exact row count of the search below is stable.
const ALEX = "Alex Duplicate";
const SAM = "Sam Duplicate";

// A number no seeded person holds — different area code entirely, so the
// duplicate check has nothing to match.
const UNIQUE_PHONE = "+1 646 555 0111";

const rowsOf = (page: Page): Locator => page.locator("tbody tr");

const gotoSearch = async (page: Page, query: string) => {
  await page.goto(
    `/dashboard/people-directory?query=${encodeURIComponent(query)}`,
  );
};

// react-hook-form applies its defaultValues after mount, which can land on
// top of an early fill() and leave the previous value concatenated to ours.
// Re-fill until the value sticks.
const fillStable = async (field: Locator, text: string) => {
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

const nameField = (page: Page) => page.getByLabel("Name *", { exact: true });
// The staff form's label renders as "Phone (or email)".
const phoneField = (page: Page) => page.getByLabel(/^Phone/);

const submitNewPerson = async (page: Page, name: string, phone: string) => {
  await page.goto("/dashboard/people-directory/new");
  await fillStable(nameField(page), name);
  await fillStable(phoneField(page), phone);
  await page.getByRole("button", { name: /^Create Person$/ }).click();
};

// The negative lookahead matters: without it this also matches the
// /people-directory/new page the form is submitted from, so waitForURL would
// resolve immediately and every redirect assertion below would be vacuous.
const PERSON_PROFILE_URL = /\/dashboard\/people-directory\/(?!new$)[^/]+$/;

const duplicateAlert = (page: Page) =>
  page.getByRole("alert").filter({ hasText: "Possible duplicate person" });

// First: the duplicate cases below add a third person on +12125550188, which
// would change this row count.
test("a digits-only query finds both stored formats of the same number", async ({
  page,
}) => {
  // Neither raw phone string contains "2125550188" — "(212) 555-0188" and
  // "212.555.0188" both have punctuation in the way. Only the phoneNormalized
  // column (+12125550188) can produce these two rows, so this assertion fails
  // outright if normalization stops running on write.
  await gotoSearch(page, "2125550188");

  const rows = rowsOf(page);
  await expect(rows).toHaveCount(2);
  // Each row shows its number as stored, not reformatted.
  await expect(rows.filter({ hasText: ALEX })).toContainText("(212) 555-0188");
  await expect(rows.filter({ hasText: SAM })).toContainText("212.555.0188");
});

test("a differently formatted phone triggers the duplicate warning, and Use them instead opens the match", async ({
  page,
}) => {
  await submitNewPerson(page, "E2E Phone Dup Probe", "+1 212 555 0188");

  // findFirst has no orderBy, so either seeded fixture may win the match.
  await expect(duplicateAlert(page)).toBeVisible();
  await expect(duplicateAlert(page)).toContainText(
    new RegExp(`${ALEX}|${SAM}`),
  );
  // Phone matches are soft: the escape hatch is offered. (An email match is a
  // hard unique constraint and renders no "Continue anyway".)
  await expect(
    page.getByRole("button", { name: "Continue anyway" }),
  ).toBeVisible();
  // Nothing was written while the warning stands.
  await expect(page).toHaveURL(/\/dashboard\/people-directory\/new/);

  const matched = await duplicateAlert(page).textContent();
  await duplicateAlert(page).getByRole("link", { name: "Use them instead" }).click();

  await page.waitForURL(PERSON_PROFILE_URL, { timeout: 60_000 });
  // Landed on whichever fixture the warning named, not on a new record.
  const expected = matched?.includes(ALEX) ? ALEX : SAM;
  await expect(page.getByText(expected).first()).toBeVisible();
});

test("a phone no one else holds creates the person with no warning", async ({
  page,
}) => {
  await submitNewPerson(page, "E2E Unique Phone", UNIQUE_PHONE);

  // Redirects to the new person's profile on success.
  await page.waitForURL(PERSON_PROFILE_URL, { timeout: 60_000 });
  await expect(page.getByText("E2E Unique Phone").first()).toBeVisible();
  await expect(duplicateAlert(page)).toHaveCount(0);
});

// Last: this one writes a third person on +12125550188, which would change
// the row count the search case above asserts.
test("Continue anyway saves the record past the warning", async ({ page }) => {
  const name = "E2E Dup Confirmed";
  const phone = "212.555.0188";
  await submitNewPerson(page, name, phone);

  await expect(duplicateAlert(page)).toBeVisible();
  await page.getByRole("button", { name: "Continue anyway" }).click();

  await page.waitForURL(PERSON_PROFILE_URL, { timeout: 60_000 });
  await expect(page.getByText(name).first()).toBeVisible();
  // Saved with the number it was warned about, not lost on the way through.
  await expect(page.getByText(phone)).toBeVisible();
});
