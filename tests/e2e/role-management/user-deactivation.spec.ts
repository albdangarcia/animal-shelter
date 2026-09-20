import { test, expect, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { bootstrapAdminAuth, firstRowIdByQuery } from "../support/note-audit";
import {
  APPLICANT_NAME,
  MY_APPLICATIONS_PATH,
  SEEDED_USER_PASSWORD,
  fillStable,
  signIn,
} from "../support/applications";

// Barring an account, and lifting the bar.
//
// prisma/seed.ts gives "Casey Deactivated" (casey.deactivated@example.com) an
// account that starts deactivated. It is not one of the six roled accounts the
// other specs sign in as, and must stay that way: the first thing this file
// proves is that it cannot sign in.
//
// Everything here ends where it started — the account deactivated, the email
// back on its original address — so the specs that run after this one see the
// seed as it was. The one thing it leaves behind is two notes on the record.
// No retries, for the same reason as the unlink spec: a retry starts against
// whatever state the failed attempt left, and reports that instead of the
// failure.

const storageState = path.join(os.tmpdir(), "user-deactivation-admin.state.json");
const roleManagementPath = "/dashboard/settings/role-management";

const ACCOUNT_EMAIL = "casey.deactivated@example.com";
const ACCOUNT_NAME = "Casey Deactivated";
const MOVED_EMAIL = "casey.deactivated.moved@example.com";
const REASON = "Repeated harassing applications";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ trace: "retain-on-failure" });

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

let accountPersonId: string;

const accountRow = (page: Page) =>
  page.getByRole("row").filter({ hasText: ACCOUNT_EMAIL });

const findAccount = async (page: Page, status: "active" | "deactivated") => {
  await page.goto(
    `${roleManagementPath}?query=${encodeURIComponent(ACCOUNT_EMAIL)}&status=${status}`,
  );
};

const openRowMenu = async (page: Page, itemName: RegExp) => {
  await accountRow(page).getByRole("button", { name: /open menu/i }).click();
  await page.getByRole("menuitem", { name: itemName }).click();
  return page.getByRole("alertdialog");
};

test("the Deactivated filter lists the seeded account and the Status column shows it", async ({
  page,
}) => {
  await findAccount(page, "deactivated");
  await expect(accountRow(page)).toBeVisible();
  await expect(accountRow(page).getByText("Deactivated", { exact: true })).toBeVisible();

  // The other direction of the same filter: it is not among the active ones.
  await findAccount(page, "active");
  await expect(accountRow(page)).toHaveCount(0);
});

test("a deactivated account cannot sign in, and is told why", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto(`/sign-in?callbackUrl=${encodeURIComponent("/dashboard")}`);
  await page.getByLabel(/email address/i).fill(ACCOUNT_EMAIL);
  await page.getByLabel(/^password$/i).fill(SEEDED_USER_PASSWORD);
  await page
    .locator("form")
    .filter({ has: page.getByLabel(/email address/i) })
    .getByRole("button", { name: /^sign in$/i })
    .click();

  // A named refusal, not a 500 and not a silent success that bounces back.
  await expect(page.getByText(/account has been deactivated/i)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/sign-in");

  // The other half of the same refusal. A social sign-in cannot throw back
  // into the form — better-auth answers its callback with a redirect — so it
  // comes back to this page carrying the code, and the page owns the wording.
  // Driven by the URL because the round trip through GitHub is not ours to
  // make; what is ours is that the code arrives and is named rather than
  // dumped on better-auth's own error page.
  // The literal rather than the export: importing `auth.options` here would
  // pull better-auth and a Prisma client into the Playwright process.
  await page.goto("/sign-in?error=ACCOUNT_DEACTIVATED");
  // By slot, not by `role="alert"`: Next's own route announcer carries that
  // role too, so the role locator matches two elements once hydrated.
  const alert = page.locator('[data-slot="alert"]');
  await expect(alert).toContainText(/account has been deactivated/i);

  // Anything else stays generic, and nothing the query string carries is
  // rendered back.
  await page.goto(
    "/sign-in?error=state_mismatch&error_description=Call%20555-0100%20now",
  );
  await expect(alert).toContainText(/contact the shelter if it keeps/i);
  await expect(alert).not.toContainText("555-0100");
  await context.close();
});

// The one rule an account withholds from staff, and what a deactivated account
// gives back. Run before the reactivation below, while the account is barred:
// it is the only time the "no account" reading of it is what is being tested.
test("staff can edit the email of a deactivated account, but not of an active one", async ({
  page,
}) => {
  accountPersonId = await firstRowIdByQuery(
    page,
    "/dashboard/people-directory",
    ACCOUNT_NAME,
  );

  const setEmail = async (personId: string, email: string) => {
    await page.goto(`/dashboard/people-directory/${personId}/edit`);
    await fillStable(page.getByLabel("Email (or phone)"), email);
    await page.getByRole("button", { name: "Save Changes" }).click();
  };

  await setEmail(accountPersonId, MOVED_EMAIL);
  await expect(page.getByText("Person updated successfully.")).toBeVisible();

  await page.goto(`/dashboard/people-directory/${accountPersonId}`);
  await expect(page.getByText(MOVED_EMAIL).first()).toBeVisible();

  // The header card says the account is barred. Without it, this edit
  // succeeding while the same edit on an active account is refused reads as
  // arbitrary — nothing else on the profile distinguishes the two.
  const header = page.locator('[data-slot="card"]').first();
  await expect(header.getByText("Deactivated", { exact: true })).toBeVisible();
  await expect(header).toContainText("account cannot sign in");

  // Put back before anything signs in with it.
  await setEmail(accountPersonId, ACCOUNT_EMAIL);
  await expect(page.getByText("Person updated successfully.")).toBeVisible();

  // An active account is still refused, and the refusal is on the field.
  const activePersonId = await firstRowIdByQuery(
    page,
    "/dashboard/people-directory",
    APPLICANT_NAME,
  );
  await page.goto(`/dashboard/people-directory/${activePersonId}`);
  await expect(
    page.locator('[data-slot="card"]').first().getByText("Deactivated"),
  ).toHaveCount(0);
  await setEmail(activePersonId, "someone.else@example.com");
  await expect(
    page.getByText(/signs in with this address/i),
  ).toBeVisible();
});

test("reactivating restores sign-in, and deactivating ends a session already open", async ({
  page,
  browser,
}) => {
  await findAccount(page, "deactivated");
  let dialog = await openRowMenu(page, /^reactivate$/i);
  await dialog.getByRole("button", { name: /^reactivate$/i }).click();
  await expect(page.getByText("Account reactivated.")).toBeVisible();

  // Their own context: this file's storageState is the admin.
  const context = await browser.newContext({ storageState: undefined });
  const applicant = await context.newPage();
  await signIn(applicant, ACCOUNT_EMAIL, SEEDED_USER_PASSWORD);
  await applicant.goto(MY_APPLICATIONS_PATH);
  expect(new URL(applicant.url()).pathname).toBe(MY_APPLICATIONS_PATH);

  // Deactivating needs a reason, so the button is not offered without one.
  await findAccount(page, "active");
  dialog = await openRowMenu(page, /^deactivate$/i);
  const confirm = dialog.getByRole("button", { name: /^deactivate$/i });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Reason").fill(REASON);
  await confirm.click();
  await expect(page.getByText("Account deactivated.")).toBeVisible();

  // The point of ending sessions in the same transaction: the person who is
  // already signed in stops being able to act on the next request, rather
  // than carrying on until the cookie expires. Nothing is signed out here —
  // this page just makes its next request.
  await applicant.goto(MY_APPLICATIONS_PATH);
  await applicant.waitForURL((url) => url.pathname === "/sign-in", {
    timeout: 60_000,
  });
  await context.close();
});

test("both directions are noted on the record", async ({ page }) => {
  await page.goto(`/dashboard/people-directory/${accountPersonId}/notes`);
  await expect(page.getByText(new RegExp(REASON))).toBeVisible();
  await expect(page.getByText(/reactivated\. It can sign in again/)).toBeVisible();
});

// The seed is applied once per run, so the state has to be back where the
// other files expect it.
test("the account ends the run deactivated, on its own address", async ({
  page,
}) => {
  await findAccount(page, "deactivated");
  await expect(accountRow(page)).toBeVisible();
});
