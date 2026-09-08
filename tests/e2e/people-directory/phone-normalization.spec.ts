import { test, expect, type Locator, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const adminPassword = process.env.ADMIN_PASSWORD;

// One sign-in for the whole file, reused as storage state. The better-auth
// sign-in endpoint rate-limits after a few hits inside a minute, and this spec
// has more cases than that budget — logging in per test would flake.
const storageStatePath = path.join(
  os.tmpdir(),
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
// exact row counts below are stable.
const ALEX = "Alex Duplicate";
const SAM = "Sam Duplicate";

// A number no seeded person holds — different area code entirely, so the
// duplicate check has nothing to match.
const UNIQUE_PHONE = "+1 646 555 0111";

// Note: an empty result set still renders one row ("No results."), so assert
// on the row contents rather than expecting a count of 0.
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

const nameField = (page: Page) => page.getByLabel("Name", { exact: true });
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

/* -------------------------------------------------------------------------
 * Search — read-only. These run before the mutating duplicate cases below,
 * which add a third person on +12125550188 and would break the row counts.
 * ---------------------------------------------------------------------- */

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
  await expect(rows.filter({ hasText: ALEX })).toHaveCount(1);
  await expect(rows.filter({ hasText: SAM })).toHaveCount(1);
});

test("a punctuated query finds the number stored with different punctuation", async ({
  page,
}) => {
  // Raw `contains` on this query matches Alex alone; Sam comes back only via
  // the normalized column. The reverse holds for "212.555.0188".
  await gotoSearch(page, "(212) 555-0188");

  const rows = rowsOf(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: ALEX })).toHaveCount(1);
  await expect(rows.filter({ hasText: SAM })).toHaveCount(1);
});

test("a partial digit run spanning punctuation matches both formats", async ({
  page,
}) => {
  // "5550188" is how staff type a number they half-remember, and it spans a
  // punctuation boundary in both stored forms ("555-0188" and "555.0188"), so
  // raw `contains` matches neither. Deliberately not "0188": that shorter
  // query is a substring of both raw strings, so it would pass even with
  // normalization switched off and would prove nothing.
  //
  // No other seeded number normalizes into "5550188" — the generated walk-in
  // pool runs +12125551000 upward.
  await gotoSearch(page, "5550188");

  const rows = rowsOf(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: ALEX })).toHaveCount(1);
  await expect(rows.filter({ hasText: SAM })).toHaveCount(1);
});

test("an email with a stray digit is not treated as a phone search", async ({
  page,
}) => {
  // Regression for fix: this query's digits are just "1", which
  // as a `phoneNormalized contains` matched nearly every stored number and
  // swamped the email condition, returning the whole directory.
  await gotoSearch(page, "surrenderer1@example.com");

  const rows = rowsOf(page);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Jane Doe");
});

test("an unparseable phone is kept verbatim and stays out of digit search", async ({
  page,
}) => {
  // normalizePhone() returns null here, so the row has no phoneNormalized to
  // match on — but the raw column is untouched and still renders.
  await gotoSearch(page, "call the front desk");

  const rows = rowsOf(page);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Unparseable Phone Contact");
  await expect(rows.first()).toContainText("call the front desk");
});

/* -------------------------------------------------------------------------
 * Duplicate detection — mutating. "Continue anyway" is deliberately last.
 * ---------------------------------------------------------------------- */

test("a differently formatted phone triggers the duplicate warning", async ({
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

test("Use them instead navigates to the matched contact", async ({ page }) => {
  await submitNewPerson(page, "E2E Dup Use Existing", "212 555 0188");

  await expect(duplicateAlert(page)).toBeVisible();
  const matched = await duplicateAlert(page).textContent();

  await duplicateAlert(page).getByRole("link", { name: "Use them instead" }).click();

  await page.waitForURL(PERSON_PROFILE_URL, { timeout: 60_000 });
  // Landed on whichever fixture the warning named, not on a new record.
  const expected = matched?.includes(ALEX) ? ALEX : SAM;
  await expect(page.getByText(expected).first()).toBeVisible();
});

// Last: this one writes a third person on +12125550188, which would change
// the row counts every search case above asserts.
test("Continue anyway saves the record past the warning", async ({ page }) => {
  const name = "E2E Dup Confirmed";
  await submitNewPerson(page, name, "212.555.0188");

  await expect(duplicateAlert(page)).toBeVisible();
  await page.getByRole("button", { name: "Continue anyway" }).click();

  await page.waitForURL(PERSON_PROFILE_URL, { timeout: 60_000 });
  await expect(page.getByText(name).first()).toBeVisible();

  // And the new record is reachable by the normalized number, which is the
  // whole point of deriving the column on every write.
  await gotoSearch(page, "2125550188");
  await expect(rowsOf(page).filter({ hasText: name })).toHaveCount(1);
});
