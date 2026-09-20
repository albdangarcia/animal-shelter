import { test, expect } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { bootstrapAdminAuth, firstRowIdByQuery } from "../support/note-audit";
import {
  MY_APPLICATIONS_PATH,
  SEEDED_USER_PASSWORD,
  signIn,
} from "../support/applications";

// The repair for an account linked to the wrong person's record.
//
// prisma/seed.ts gives "Pat Mislinked" (pat.mislinked@example.com) the state
// the bug produces: a Person the shelter wrote down, carrying an address that
// is really somebody else's, with that somebody else's account auto-linked to
// it by `linkOrCreatePerson`. Nothing else in the seed depends on the pair,
// because this spec destroys it — there is no relink.
//
// Admin-only on purpose: PERSONS_MANAGE covers keeping the record, not
// deciding whose account it is, and nothing in the app puts the link back.

const storageState = path.join(os.tmpdir(), "account-unlink-admin.state.json");

// No retries, unlike the CI default. The unlink is irreversible and the seed is
// applied once per run (playwright/global-setup.ts), so a retry starts against a
// database where Pat Mislinked is already unlinked: the first test then fails
// deterministically, and the run reports a regression in the feature instead of
// the flake that actually happened. A retry here can only ever hide the real
// failure behind a different one.
test.describe.configure({ mode: "serial", retries: 0 });

// `trace: "on-first-retry"` is what the config gives everything else, and with
// retries off it would never fire — so keep the trace of the one failure this
// file gets.
test.use({ trace: "retain-on-failure" });

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

const ACCOUNT_EMAIL = "pat.mislinked@example.com";
const RECORD_PHONE = "212-555-0166";
const SEEDED_NOTE = "Asked us to call the landline, not email.";

let originalPersonId: string;
let replacementPersonId: string;

test("the profile names the sign-in address and offers the unlink", async ({
  page,
}) => {
  // Resolved before the unlink: afterwards two records answer to this name,
  // because the replacement takes its name off the account.
  originalPersonId = await firstRowIdByQuery(
    page,
    "/dashboard/people-directory",
    "Pat Mislinked",
  );

  await page.goto(`/dashboard/people-directory/${originalPersonId}`);
  await expect(page.getByText("Sign-in Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unlink Account" }),
  ).toBeVisible();
});

test("unlinking moves the login to a record of its own", async ({ page }) => {
  await page.goto(`/dashboard/people-directory/${originalPersonId}`);

  await page.getByRole("button", { name: "Unlink Account" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText(ACCOUNT_EMAIL)).toBeVisible();
  await dialog.getByRole("button", { name: "Unlink Account" }).click();

  await expect(page.getByText("Login account unlinked.")).toBeVisible();

  // The action hands back the new record and the button navigates to it: it
  // holds a name copied off the account and nothing else, so it is where
  // whoever did this has to go next.
  await page.waitForURL(
    (url) =>
      /^\/dashboard\/people-directory\/[^/]+$/.test(url.pathname) &&
      !url.pathname.endsWith(originalPersonId),
    { timeout: 60_000 },
  );
  replacementPersonId = page.url().split("/").pop() as string;

  // The address left with the account: it is the key the sign-up hook
  // auto-links on, so leaving it behind would invite the same mislink again.
  await expect(page.getByText(ACCOUNT_EMAIL).first()).toBeVisible();
  // And nothing else came with it — the record starts empty.
  await expect(page.getByText(RECORD_PHONE)).toHaveCount(0);
});

test("the original record keeps its history and is staff-editable again", async ({
  page,
}) => {
  await page.goto(`/dashboard/people-directory/${originalPersonId}`);

  // No account on it any more: the account-only rows are gone, and with them
  // everything staff were refused while it was there.
  await expect(page.getByText("Sign-in Email")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Unlink Account" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Edit Contact Info" }),
  ).toBeVisible();

  // What the shelter recorded about this person is still on it. Exact, because
  // the header card renders the address as one line and the profile card
  // breaks it into rows, so a substring match hits both.
  await expect(page.getByText(RECORD_PHONE)).toBeVisible();
  await expect(page.getByText("12 Carmine St", { exact: true })).toBeVisible();

  await page.goto(`/dashboard/people-directory/${originalPersonId}/notes`);
  await expect(page.getByText(SEEDED_NOTE)).toBeVisible();
  await expect(
    page.getByText(/unlinked from this record and moved to a new person record/),
  ).toBeVisible();
});

test("the new record says where it came from", async ({ page }) => {
  await page.goto(`/dashboard/people-directory/${replacementPersonId}/notes`);
  await expect(
    page.getByText(/Created by unlinking a login account/),
  ).toBeVisible();
});

// The whole point of repointing rather than deleting: the person whose account
// this actually is keeps their login. What they lose is the record that was
// never theirs, so "My Applications" is empty rather than showing somebody
// else's — which is what it showed before the unlink.
test("the account still signs in, now on its own empty record", async ({
  browser,
}) => {
  // Its own context: this file's storageState is the admin who did the unlink.
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  try {
    await signIn(page, ACCOUNT_EMAIL, SEEDED_USER_PASSWORD);
    await page.goto(MY_APPLICATIONS_PATH);
    await expect(page.getByText(/no results|no applications/i)).toBeVisible();
  } finally {
    await context.close();
  }
});
