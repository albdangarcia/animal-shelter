import { test, expect, type Locator, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const adminPassword = process.env.ADMIN_PASSWORD;

// One sign-in for the whole file, reused as storage state. The better-auth
// sign-in endpoint rate-limits after a few hits inside a minute, and this spec
// has more cases than that budget — logging in per test would flake.
const storageStatePath = path.join(
  os.tmpdir(),
  "walk-in-adoption-admin.state.json",
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
      "ADMIN_PASSWORD must be available to run the walk-in adoption application E2E spec.",
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

// "WalkIn TestUser" is hardcoded in prisma/seed.ts's personData (a walk-in with
// contact details but no user account) and kept out of every seeded applicant
// pool, so her adoption-applications tab starts empty. "Jane Doe" is a seeded
// registered user guaranteed at least one adoption application. Find each via
// the people directory search rather than hardcoding an id, the way the
// animals spec finds rows by status filter.
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
// top of an early fill() and leave a prefilled value concatenated to ours.
// Re-fill until the value sticks.
const fillStable = async (field: Locator, text: string) => {
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

// waitForURL's glob treats `*` as "not across /", so a `?*` tail never matches
// a query string that itself contains slashes (our returnTo values do). Match
// on the pathname instead.
const waitForPathname = (page: Page, pathname: string | RegExp) =>
  page.waitForURL(
    (url) =>
      typeof pathname === "string"
        ? url.pathname === pathname
        : pathname.test(url.pathname),
    { timeout: 60_000 },
  );

const EDIT_PATH = /^\/dashboard\/adoption-applications\/[^/]+\/edit$/;
const REVIEW_PATH = /^\/dashboard\/adoption-applications\/[^/]+\/review$/;

// A PUBLISHED animal to file the application against. Names are seeded random,
// but the listing-status filter is stable — take the first row (pattern from
// edit-and-outcome.spec.ts) and read both its id and its displayed name.
const firstPublishedAnimal = async (page: Page) => {
  await page.goto("/dashboard/animals?listingStatus=PUBLISHED&pageSize=10");
  const link = page.locator("tbody tr").first().getByRole("link").first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const name = (await link.innerText()).trim();
  if (!href || !name) {
    throw new Error("No PUBLISHED animal row found.");
  }
  return { id: href.split("/").pop() as string, name };
};

// The animal picker is a cmdk combobox with shouldFilter={false} that fetches
// server-side (>=2 chars, 300ms debounce + round-trip) — always wait for the
// option before clicking, it is never instant.
const pickAnimal = async (page: Page, animalName: string) => {
  // The trigger has no accessible name (its text is the combobox value, not a
  // label), so disambiguate from the State / Living Situation selects by text.
  await page
    .getByRole("combobox")
    .filter({ hasText: "Search for an animal" })
    .click();
  await page.getByPlaceholder("Type an animal name...").fill(animalName);
  const option = page.getByRole("option", { name: animalName }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  // Selection commits to a Badge + a "Clear" button; wait for it so the
  // picker's trailing router.replace settles before the next fill().
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
};

// The yard / children radio group labels are plain <div>s, not associated with
// the group, and there are two "Yes"/"No" pairs on the form. Scope to the
// innermost element that holds both the label text and a radio.
const radioByGroupLabel = (
  page: Page,
  label: string,
  option: "Yes" | "No",
) =>
  page
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .filter({ has: page.getByRole("radio") })
    .last()
    .getByRole("radio", { name: option });

// The row's dropdown trigger occasionally swallows the first click right after
// a navigation (before hydration settles). Retry until a menu item shows,
// re-clicking only when the menu is actually closed so we never toggle it shut.
const openRowMenu = async (page: Page) => {
  const trigger = page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "Open menu" });
  const reviewItem = page.getByRole("menuitem", { name: "Review" });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await reviewItem.isVisible())) {
      await trigger.click();
    }
    await expect(reviewItem).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
};

let walkInId: string;

test("the walk-in's adoption applications tab shows an Add button", async ({
  page,
}) => {
  walkInId = await personIdByName(page, "WalkIn TestUser");
  await page.goto(
    `/dashboard/people-directory/${walkInId}/adoption-applications`,
  );

  // Button asChild renders a plain <a>, so the accessible role is "link".
  const addLink = page.getByRole("link", { name: "Add Application" });
  await expect(addLink).toBeVisible();

  const href = await addLink.getAttribute("href");
  expect(href).toMatch(
    /^\/dashboard\/adoption-applications\/new\?personId=/,
  );
  expect(href).toContain(
    `returnTo=/dashboard/people-directory/${walkInId}/adoption-applications`,
  );
});

test("Add Application navigates to the standalone route with no person shell", async ({
  page,
}) => {
  await page.goto(
    `/dashboard/people-directory/${walkInId}/adoption-applications`,
  );
  await page.getByRole("link", { name: "Add Application" }).click();
  await waitForPathname(page, "/dashboard/adoption-applications/new");

  // The person nav tabs (Profile / Fostering / …) must be gone — this route
  // is not nested under the person layout.
  await expect(
    page.getByRole("link", { name: "Fostering", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Submitting on behalf of WalkIn TestUser"),
  ).toBeVisible();
});

test("filling and submitting the form redirects to the person's tab with the new row", async ({
  page,
}) => {
  const animal = await firstPublishedAnimal(page);

  await page.goto(
    `/dashboard/adoption-applications/new?personId=${walkInId}&returnTo=/dashboard/people-directory/${walkInId}/adoption-applications`,
  );

  await pickAnimal(page, animal.name);

  // Contact fields are prefilled from WalkIn TestUser's Person record — fillStable
  // overwrites them (and proves they are editable).
  await fillStable(
    page.getByLabel("Full Name *", { exact: true }),
    "WalkIn TestUser",
  );
  await fillStable(
    page.getByLabel("Email *", { exact: true }),
    "walkin.testuser@example.com",
  );
  await fillStable(
    page.getByLabel("Phone *", { exact: true }),
    "212-555-0177",
  );
  await fillStable(
    page.getByLabel("Address Line 1 *", { exact: true }),
    "410 Amsterdam Ave",
  );
  await fillStable(page.getByLabel("City *", { exact: true }), "New York");
  await fillStable(page.getByLabel("ZIP Code *", { exact: true }), "10024");

  await page.getByLabel("State *", { exact: true }).click();
  await page.getByRole("option", { name: "New York" }).click();

  await page.getByLabel("Living Situation *", { exact: true }).click();
  await page.getByRole("option", { name: "Own Home" }).click();

  await fillStable(
    page.getByLabel("Household Size *", { exact: true }),
    "3",
  );

  await radioByGroupLabel(page, "Do they have a yard? *", "No").click();
  await radioByGroupLabel(page, "Are there children in the home? *", "No").click();

  await fillStable(
    page.getByLabel("Animal Experience *", { exact: true }),
    "Grew up with two rescue dogs and fostered kittens for a local shelter.",
  );
  const reason = `Looking for a calm companion — E2E ${Date.now()}`;
  await fillStable(
    page.getByLabel("Reason for Adoption *", { exact: true }),
    reason,
  );

  await page.getByRole("button", { name: "Submit Application" }).click();

  await expect(
    page.getByText("Application submitted successfully."),
  ).toBeVisible();
  await waitForPathname(
    page,
    `/dashboard/people-directory/${walkInId}/adoption-applications`,
  );

  // revalidatePath regression check — the row is there without a manual reload.
  const row = page.locator("tbody tr").filter({ hasText: animal.name });
  await expect(row).toBeVisible();
  await expect(row.getByText("Pending", { exact: true })).toBeVisible();
});

test("the application can be edited from the row menu", async ({ page }) => {
  await page.goto(
    `/dashboard/people-directory/${walkInId}/adoption-applications`,
  );

  await openRowMenu(page);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await waitForPathname(page, EDIT_PATH);

  // Standalone: no person tabs, and the animal picker is edit-only-absent.
  await expect(
    page.getByRole("link", { name: "Fostering", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Animal to Adopt")).toHaveCount(0);

  const newReason = `Revised reason — E2E ${Date.now()}`;
  await fillStable(
    page.getByLabel("Reason for Adoption *", { exact: true }),
    newReason,
  );
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(
    page.getByText("Application updated successfully."),
  ).toBeVisible();
  await waitForPathname(
    page,
    `/dashboard/people-directory/${walkInId}/adoption-applications`,
  );

  // Reopen the edit form — the new reason persisted.
  await openRowMenu(page);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await waitForPathname(page, EDIT_PATH);
  await expect(
    page.getByLabel("Reason for Adoption *", { exact: true }),
  ).toHaveValue(newReason, { timeout: 15_000 });
});

test("the application can be reviewed and its status advanced", async ({
  page,
}) => {
  await page.goto(
    `/dashboard/people-directory/${walkInId}/adoption-applications`,
  );

  await openRowMenu(page);
  await page.getByRole("menuitem", { name: "Review" }).click();
  await waitForPathname(page, REVIEW_PATH);

  await expect(
    page.getByText("Applicant Information (Read-Only)"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Full Name", { exact: true }),
  ).toBeDisabled();

  // PENDING -> REVIEWING is exempt from the status-change-reason requirement.
  await page.getByLabel("Application Status *", { exact: true }).click();
  await page.getByRole("option", { name: "Reviewing" }).click();
  await page.getByRole("button", { name: "Update Application" }).click();

  await expect(
    page.getByText("Application updated successfully."),
  ).toBeVisible();
  await waitForPathname(
    page,
    `/dashboard/people-directory/${walkInId}/adoption-applications`,
  );

  const row = page.locator("tbody tr").first();
  await expect(row.getByText("Reviewing", { exact: true })).toBeVisible();
});

test("Edit Application Fields round-trips between review and edit", async ({
  page,
}) => {
  await page.goto(
    `/dashboard/people-directory/${walkInId}/adoption-applications`,
  );
  await openRowMenu(page);
  await page.getByRole("menuitem", { name: "Review" }).click();
  await waitForPathname(page, REVIEW_PATH);

  const reviewUrl = new URL(page.url());
  const appId = reviewUrl.pathname.split("/")[3];

  // Only rendered for walk-ins.
  await page
    .getByRole("link", { name: "Edit Application Fields" })
    .click();
  await waitForPathname(
    page,
    `/dashboard/adoption-applications/${appId}/edit`,
  );
  expect(decodeURIComponent(new URL(page.url()).search)).toBe(
    `?returnTo=/dashboard/adoption-applications/${appId}/review`,
  );

  await page.getByRole("link", { name: "Cancel" }).click();
  await waitForPathname(
    page,
    `/dashboard/adoption-applications/${appId}/review`,
  );
  await expect(
    page.getByText("Applicant Information (Read-Only)"),
  ).toBeVisible();
});

test("a registered user's application 404s on the staff edit route", async ({
  page,
}) => {
  const janeId = await personIdByName(page, "Jane Doe");
  await page.goto(
    `/dashboard/people-directory/${janeId}/adoption-applications`,
  );

  await openRowMenu(page);
  const reviewHref = await page
    .locator("a", { has: page.getByRole("menuitem", { name: "Review" }) })
    .getAttribute("href");
  const janeAppId = reviewHref?.match(
    /adoption-applications\/([^/?]+)\/review/,
  )?.[1];
  if (!janeAppId) {
    throw new Error(`Could not read Jane Doe's application id from ${reviewHref}`);
  }

  await page.goto(`/dashboard/adoption-applications/${janeAppId}/edit`);
  await expect(
    page.getByRole("heading", { name: /not found/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Changes" }),
  ).toHaveCount(0);
});

test("the pre-refactor nested new route is gone", async ({ page }) => {
  await page.goto(
    `/dashboard/people-directory/${walkInId}/adoption-applications/new`,
  );
  await expect(
    page.getByRole("heading", { name: /not found/i }),
  ).toBeVisible();
});