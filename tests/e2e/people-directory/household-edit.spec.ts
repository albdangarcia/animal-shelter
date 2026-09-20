import { test, expect, type Locator, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import {
  APPLICANT_EMAIL,
  SEEDED_USER_PASSWORD,
  signIn as signInAs,
} from "../support/applications";

const adminPassword = process.env.ADMIN_PASSWORD;

// One sign-in for the whole file, reused as storage state. The better-auth
// sign-in endpoint rate-limits after a few hits inside a minute, and this spec
// has more cases than that budget — logging in per test would flake.
const storageStatePath = path.join(
  os.tmpdir(),
  "household-edit-admin.state.json",
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
      "ADMIN_PASSWORD must be available to run the household edit E2E spec.",
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

// Both fixtures are hardcoded in prisma/seed.ts's personData and stable
// across reseeds. Find each via the people directory search rather than
// hardcoding an id, the way the animals spec finds rows by status filter.
const personIdByName = async (page: Page, name: string) => {
  await page.goto(
    `/dashboard/people-directory?query=${encodeURIComponent(name)}`,
  );
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();
  const href = await firstRow.getByRole("link").first().getAttribute("href");
  if (!href) {
    throw new Error(`No person row found for query=${name}`);
  }
  return href.split("/").pop() as string;
};

// react-hook-form applies its defaultValues after mount, which can land on
// top of an early fill() and leave the seed value concatenated to ours.
// Re-fill until the value sticks.
const fillStable = async (field: Locator, text: string) => {
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

let alexId: string;

test("a person with no household profile shows the empty state and an Add button", async ({
  page,
}) => {
  alexId = await personIdByName(page, "Alex Duplicate");
  await page.goto(`/dashboard/people-directory/${alexId}`);
  await expect(
    page.getByText("No household information on file."),
  ).toBeVisible();
  // Button asChild renders a plain <a>, so the accessible role is "link".
  await expect(
    page.getByRole("link", { name: "Add Household Info" }),
  ).toBeVisible();
});

test("clicking Add Household Info navigates to the household edit route", async ({
  page,
}) => {
  await page.goto(`/dashboard/people-directory/${alexId}`);
  await page.getByRole("link", { name: "Add Household Info" }).click();
  await page.waitForURL(`**/dashboard/people-directory/*/household/edit`, {
    timeout: 60_000,
  });
});

test("saving the household form redirects back to the profile and shows the new values", async ({
  page,
}) => {
  await page.goto(`/dashboard/people-directory/${alexId}/household/edit`);

  await page.getByLabel("Living Situation *").click();
  await page.getByRole("option", { name: "Rent Apartment" }).click();

  // Renting reveals the conditional landlord-permission field.
  await page.getByLabel("Do you have landlord permission? *").click();
  await page.getByRole("option", { name: "Yes" }).click();

  await fillStable(page.getByLabel("Household Size *"), "4");

  await page.getByLabel("Do you have a yard? *").click();
  await page.getByRole("option", { name: "Yes" }).click();

  await page.getByLabel("Do you have children at home? *").click();
  await page.getByRole("option", { name: "No" }).click();

  const animalExperience = `E2E household save ${Date.now()}`;
  await fillStable(
    page.getByLabel("Experience with Animals *"),
    animalExperience,
  );

  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Household profile updated.")).toBeVisible();
  await page.waitForURL(`**/dashboard/people-directory/${alexId}`, {
    timeout: 60_000,
  });

  // Regression check for the /profile revalidatePath bug: the read-only
  // card must reflect the values just saved without a manual reload.
  await expect(page.getByText("Rent Apartment")).toBeVisible();
  await expect(page.getByText(animalExperience)).toBeVisible();

  // And it says who wrote it: the seeded admin is the one signed in here.
  await expect(page.getByText(/Last edited by Admin User on /)).toBeVisible();
});

test("the button now reads Edit Household Info", async ({ page }) => {
  await page.goto(`/dashboard/people-directory/${alexId}`);
  await expect(
    page.getByRole("link", { name: "Edit Household Info" }),
  ).toBeVisible();
});

// The household profile is the shelter's record of a household, not something
// an account takes ownership of. Someone who has signed up is still the person
// staff took these answers from at the desk, and the one who most needs them
// written down is the one who cannot reach their own login.
test("a registered user's household is staff-editable", async ({ page }) => {
  const janeId = await personIdByName(page, "Jane Doe");
  await page.goto(`/dashboard/people-directory/${janeId}`);
  await expect(
    page.getByRole("link", { name: /(Edit|Add) Household Info/ }),
  ).toBeVisible();

  await page.goto(`/dashboard/people-directory/${janeId}/household/edit`);
  await expect(page.getByLabel("Living Situation *")).toBeVisible();
});

// The stamp is written by whoever saves, not only by staff, so a null editor
// can only mean the row predates the column. Here the owner saves from their own
// account page and staff then read who wrote it.
test("the owner's own edit is attributed to them", async ({
  page,
  browser,
}) => {
  const janeId = await personIdByName(page, "Jane Doe");

  // Its own context: this file's storageState is the admin.
  const context = await browser.newContext({ storageState: undefined });
  const ownerPage = await context.newPage();
  try {
    await signInAs(ownerPage, APPLICANT_EMAIL, SEEDED_USER_PASSWORD);
    await ownerPage.goto("/dashboard/account");
    await fillStable(
      ownerPage.getByLabel("Experience with Animals *"),
      `Owner edit ${Date.now()}`,
    );
    await ownerPage.getByRole("button", { name: "Save Household Info" }).click();
    await expect(
      ownerPage.getByText("Household information updated successfully."),
    ).toBeVisible();
  } finally {
    await context.close();
  }

  await page.goto(`/dashboard/people-directory/${janeId}`);
  await expect(page.getByText(/Last edited by Jane Doe on /)).toBeVisible();
});
