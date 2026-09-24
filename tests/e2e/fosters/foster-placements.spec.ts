import { test, expect, type Locator, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import { fillStable, waitForPathname } from "../support/applications";

const adminPassword = process.env.ADMIN_PASSWORD;
const fostersPath = "/dashboard/fosters";
const newPlacementPath = "/dashboard/fosters/placements/new";

// One sign-in for the whole file, reused as storage state — the better-auth
// sign-in endpoint rate-limits after a few hits inside a minute and this spec
// has far more cases than that budget. Mirrors locations.spec.ts.
const storageStatePath = path.join(os.tmpdir(), "fosters-admin.state.json");

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
      "ADMIN_PASSWORD must be available to run the fosters E2E spec.",
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

// Which foster and which animal the seed makes available is not deterministic
// — seedFostering picks its placements from a shuffled lottery, and the four
// scripted foster profiles sit on shuffled walk-in people. So this spec never
// hardcodes a foster or an animal: it derives them from the UI, using the
// roster's `capacity=available` filter (ACTIVE profiles with open < max) and
// the create form's own eligible-animal combobox.
//
// The one hardcoded fixture is Juniper, who is hand-authored in prisma/seed.ts
// and deliberately kept out of the foster lottery so her overdue placement
// stays deterministic across reseeds.
const OVERDUE_ANIMAL = "Juniper";

// Carried between the serial tests below.
let placedAnimalName = "";
let placedAnimalUrl = "";
let generalPlacementId = "";

const banner = (page: Page) =>
  page.locator("div").filter({ hasText: /^In foster with/ }).first();

// Radix SelectTrigger renders role="combobox"; the shadcn Form wiring gives
// the FormField-backed ones a real label association.
const chooseFromSelect = async (
  page: Page,
  label: string,
  option: string | RegExp,
) => {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
};

// Opens the create form for the first ACTIVE foster that still has capacity,
// and returns the resulting URL (which carries that foster's profile id).
const openCreateFormForAvailableFoster = async (page: Page) => {
  await page.goto(`${fostersPath}?capacity=available`);
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();
  await firstRow.locator('button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "New Placement" }).click();
  await page.waitForURL(`**${newPlacementPath}?fosterProfileId=*`);
  return page.url();
};

// Picks the first animal offered by the eligible-animal combobox and returns
// its name, so later assertions can find the same animal again.
const pickFirstEligibleAnimal = async (page: Page) => {
  await page.getByRole("combobox", { name: /animal/i }).click();
  const firstOption = page.getByRole("option").first();
  await expect(firstOption).toBeVisible();
  const name = (await firstOption.locator("p").first().innerText()).trim();
  await firstOption.click();
  return name;
};

// react-day-picker stamps every day button with data-day, which is the only
// unambiguous handle: the visible text is just the day number (and the grid
// also renders the adjacent months' overflow days, so "1" matches twice), and
// the aria-label would tie this spec to that library's label format.
const dayCell = (calendar: Locator, date: Date) =>
  calendar.locator(
    `button[data-day="${date.toLocaleDateString("en-US")}"]`,
  );

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const placementIdFromBanner = async (page: Page) => {
  const href = await banner(page)
    .getByRole("link", { name: "Return from Foster" })
    .getAttribute("href");
  const match = href?.match(/placements\/([^/]+)\/return/);
  if (!match) throw new Error(`No placement id in Return href: ${href}`);
  return match[1];
};

test("an animal can be placed in foster without an expected return date", async ({
  page,
}) => {
  await openCreateFormForAvailableFoster(page);

  placedAnimalName = await pickFirstEligibleAnimal(page);
  await chooseFromSelect(page, "Placement Type *", "General");

  // The open-ended case: leave Expected Return Date untouched. The field is
  // optional by design — a placement ends on an outcome, not a date.
  await expect(page.getByText("No expected date")).toBeVisible();

  await page.getByRole("button", { name: "Place in Foster" }).click();

  await expect(page.getByText("Placement created.")).toBeVisible();
  await page.waitForURL("**/dashboard/animals/**");
  placedAnimalUrl = page.url();

  await expect(banner(page)).toContainText("In foster with");
  await expect(banner(page)).toContainText("General");
  // No date was set, so the banner says nothing about a return date.
  await expect(banner(page)).not.toContainText("expected return");

  generalPlacementId = await placementIdFromBanner(page);
});

test("an animal already in foster cannot be placed again", async ({ page }) => {
  const animalId = placedAnimalUrl.split("/").pop();
  await page.goto(`${newPlacementPath}?animalId=${animalId}`);

  await expect(
    page.getByRole("heading", { name: "Already In Foster" }),
  ).toBeVisible();
  await expect(
    page.getByText(`${placedAnimalName} already has an open foster placement`),
  ).toBeVisible();
});

test("a general placement cannot be converted to an adoption", async ({
  page,
}) => {
  // Only FOSTER_TO_ADOPT placements convert; everything else goes through the
  // standard outcome flow. Reached by URL because the banner only offers the
  // Convert action for foster-to-adopt placements in the first place.
  await page.goto(
    `/dashboard/fosters/placements/${generalPlacementId}/convert`,
  );

  await expect(
    page.getByRole("heading", { name: "Not a Foster-to-Adopt Placement" }),
  ).toBeVisible();
});

test("the calendar refuses a past expected return date", async ({ page }) => {
  const today = new Date();
  // On the 1st there is no past day rendered in the current month, so the
  // guard is vacuously satisfied and there is nothing to assert.
  test.skip(today.getDate() === 1, "No past day is in view on the 1st.");

  await openCreateFormForAvailableFoster(page);
  // DateField composes the label with the current value into the trigger's
  // accessible name ("Expected Return Date: No expected date"), so a screen
  // reader announces the selected date and not just the field name.
  await page
    .getByRole("button", { name: /^Expected Return Date:/ })
    .click();

  const calendar = page.getByRole("dialog");
  await expect(calendar).toBeVisible();
  // Day 1 of the current month is always in the past here, so the picker must
  // refuse it. The server enforces the same rule via CreateFosterPlacementSchema
  // (covered by app/lib/zod-schemas/foster.schemas.test.ts) — this only proves
  // the client half.
  await expect(dayCell(calendar, startOfMonth(today))).toBeDisabled();
  // The boundary: a placement expected back *today* is still selectable, which
  // is the same rule isFosterPlacementOverdue and attention-queue signal 3 use.
  await expect(dayCell(calendar, today)).toBeEnabled();
});

test("a placement can record an expected return date", async ({ page }) => {
  await openCreateFormForAvailableFoster(page);

  await pickFirstEligibleAnimal(page);
  await chooseFromSelect(page, "Placement Type *", "Medical");

  // DateField composes the label with the current value into the trigger's
  // accessible name ("Expected Return Date: No expected date"), so a screen
  // reader announces the selected date and not just the field name.
  await page
    .getByRole("button", { name: /^Expected Return Date:/ })
    .click();
  const calendar = page.getByRole("dialog");
  // Next month's 15th is always in the future, whatever today is.
  await calendar.getByRole("button", { name: /Go to the Next Month/i }).click();
  const now = new Date();
  await dayCell(
    calendar,
    new Date(now.getFullYear(), now.getMonth() + 1, 15),
  ).click();
  await expect(page.getByText("No expected date")).toBeHidden();

  await page.getByRole("button", { name: "Place in Foster" }).click();

  await expect(page.getByText("Placement created.")).toBeVisible();
  await page.waitForURL("**/dashboard/animals/**");
  await expect(banner(page)).toContainText("expected return");
});

test("an overdue placement is flagged on the animal profile", async ({
  page,
}) => {
  await page.goto(`/dashboard/animals?query=${OVERDUE_ANIMAL}`);
  await page.getByRole("link", { name: OVERDUE_ANIMAL, exact: true }).click();
  await page.waitForURL("**/dashboard/animals/**");

  // Juniper's seeded placement is four days past its expected end date, so the
  // banner carries the overdue badge alongside the date. An open placement
  // whose date has not passed shows the date with no badge.
  await expect(banner(page)).toContainText("expected return");
  await expect(banner(page)).toContainText("Overdue");
});

test("an animal can be returned from foster", async ({ page }) => {
  await page.goto(placedAnimalUrl);
  await banner(page).getByRole("link", { name: "Return from Foster" }).click();
  await page.waitForURL("**/return");

  await chooseFromSelect(page, "Return Reason *", "Returned To Shelter");

  // The form pre-selects the unit the animal occupied before it was fostered.
  // If that unit is gone, pick the first location and unit on offer instead.
  const unitTrigger = page.getByLabel("Unit *", { exact: true });
  if ((await unitTrigger.innerText()).includes("Select a unit")) {
    await page.getByText("Select a location").click();
    await page.getByRole("option").first().click();
    await unitTrigger.click();
    await page.getByRole("option").first().click();
  }

  await page.getByRole("button", { name: "Return From Foster" }).click();

  await expect(page.getByText("Animal returned from foster.")).toBeVisible();
  await page.waitForURL("**/dashboard/animals/**");
  await expect(page.getByText("In foster with")).toBeHidden();
});

test("a foster-to-adopt placement moves the listing to Pending Adoption and converts to an adoption", async ({
  page,
}) => {
  await openCreateFormForAvailableFoster(page);

  const animalName = await pickFirstEligibleAnimal(page);
  await chooseFromSelect(page, "Placement Type *", "Foster To Adopt");
  await expect(
    page.getByText(
      "The animal's listing will move to Pending Adoption while this placement is open.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Place in Foster" }).click();
  await expect(page.getByText("Placement created.")).toBeVisible();
  await page.waitForURL("**/dashboard/animals/**");

  await expect(banner(page)).toContainText("Foster To Adopt");
  await expect(page.getByText("Pending Adoption").first()).toBeVisible();

  await banner(page).getByRole("link", { name: "Convert to Adoption" }).click();
  await page.waitForURL("**/convert");

  await page.getByRole("button", { name: "Convert to Adoption" }).click();
  await expect(
    page.getByRole("alertdialog").getByText(
      `${animalName} will be marked as adopted`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm & Convert" }).click();

  await expect(
    page.getByText("Foster placement converted to adoption."),
  ).toBeVisible();
});

test("a paused foster offers no New Placement action", async ({ page }) => {
  await page.goto(`${fostersPath}?status=PAUSED`);
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();
  await expect(firstRow).toContainText("Paused");

  await firstRow.locator('button[aria-haspopup="menu"]').first().click();
  await expect(
    page.getByRole("menuitem", { name: "View Profile" }),
  ).toBeVisible();
  // A paused profile is rejected by the action, so the roster never offers the
  // placement entry point for one.
  await expect(
    page.getByRole("menuitem", { name: "New Placement" }),
  ).toHaveCount(0);
});

// --- Conversion links the foster's own approved application ---

const REVIEW_PATH = /^\/dashboard\/adoption-applications\/[^/]+\/review$/;

// Mirrors staff-walk-in-adoption-application.spec.ts's animal picker for the
// staff "new application" form — a debounced server-search combobox, distinct
// from the placement form's locally-filtered AnimalCombobox above. Typing the
// name only drives the search; the option is picked by id (cmdk sets
// `data-value` from CommandItem's `value` prop, which this form sets to
// `animal.id` — see staff-adoption-application-form.tsx). Several seeded
// animals share a name (one readopted after a return leaves multiple rows
// with the same name and species), and picking by displayed text could
// silently resolve to a different animal than the one this test tracks by id.
const pickApplicationAnimal = async (
  page: Page,
  animal: { id: string; name: string },
) => {
  await page
    .getByRole("combobox")
    .filter({ hasText: "Search for an animal" })
    .click();
  await page.getByPlaceholder("Type an animal name...").fill(animal.name);
  const option = page.locator(`[cmdk-item][data-value="${animal.id}"]`);
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
};

// Mirrors staff-walk-in-adoption-application.spec.ts: the yard / children
// radio labels are plain <div>s, not associated with the group, and there are
// two Yes/No pairs on the form.
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

// A PUBLISHED animal to file the application against — staff create refuses
// anything else, and the foster-to-adopt placement below moves the listing to
// Pending Adoption, so the application has to be filed first. Both animal
// pickers further down select by id (see pickApplicationAnimal), so a
// same-named animal elsewhere in the seed is not a concern here.
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

// The row's dropdown trigger occasionally swallows the first click right
// after a navigation, before hydration settles — retry, re-clicking only when
// the menu is actually closed so we never toggle it shut.
const openRowMenuItem = async (row: Locator, itemName: string) => {
  const trigger = row.getByRole("button", { name: "Open menu" });
  const item = row.page().getByRole("menuitem", { name: itemName });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await item.isVisible())) {
      await trigger.click();
    }
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await item.click();
};

test("converting with the foster's approved application linked makes it read Adopted on the staff table", async ({
  page,
}) => {
  // The application has to be filed while the animal is still PUBLISHED.
  const animal = await firstPublishedAnimal(page);

  // An available foster and the person underneath the profile — the roster
  // row links straight to their people-directory record.
  await page.goto(`${fostersPath}?capacity=available`);
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();
  const personLink = firstRow.getByRole("link").first();
  const personHref = await personLink.getAttribute("href");
  if (!personHref) {
    throw new Error("No foster person link found in the roster.");
  }
  const fosterPersonId = personHref.split("/")[3];
  const fosterPersonName = (await personLink.innerText()).trim();

  await firstRow.locator('button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "New Placement" }).click();
  await page.waitForURL(`**${newPlacementPath}?fosterProfileId=*`);
  const placementFormUrl = page.url();

  // File and approve an adoption application for this foster on this animal.
  // The conversion page's picker only offers an application the derivation
  // already calls APPROVED.
  await page.goto(
    `/dashboard/adoption-applications/new?personId=${fosterPersonId}&returnTo=${encodeURIComponent(
      `/dashboard/people-directory/${fosterPersonId}/adoption-applications`,
    )}`,
  );
  await pickApplicationAnimal(page, animal);

  // Contact fields are prefilled from the foster's Person record, which does
  // not always carry a phone number — fillStable overwrites whatever is
  // there. The email is unique so the final assertion can find this exact
  // row: several seeded animals share the name "Charlie".
  const applicantEmail = `foster-conversion-e2e-${Date.now()}@example.com`;
  await fillStable(page.getByLabel("Email *", { exact: true }), applicantEmail);
  await fillStable(
    page.getByLabel("Phone *", { exact: true }),
    "212-555-0199",
  );
  await fillStable(
    page.getByLabel("Address Line 1 *", { exact: true }),
    "12 Test Lane",
  );
  await fillStable(page.getByLabel("City *", { exact: true }), "New York");
  await fillStable(page.getByLabel("ZIP Code *", { exact: true }), "10001");
  await chooseFromSelect(page, "State *", "New York");
  await chooseFromSelect(page, "Living Situation *", "Own Home");
  await fillStable(page.getByLabel("Household Size *", { exact: true }), "2");
  await radioByGroupLabel(page, "Do they have a yard? *", "No").click();
  await radioByGroupLabel(
    page,
    "Are there children in the home? *",
    "No",
  ).click();
  await fillStable(
    page.getByLabel("Animal Experience *", { exact: true }),
    "Longtime foster, prior pet owner.",
  );
  await fillStable(
    page.getByLabel("Reason for Adoption *", { exact: true }),
    `Foster-to-adopt conversion coverage — E2E ${Date.now()}`,
  );
  await page.getByRole("button", { name: "Submit Application" }).click();
  await expect(
    page.getByText("Application submitted successfully."),
  ).toBeVisible();
  await waitForPathname(
    page,
    `/dashboard/people-directory/${fosterPersonId}/adoption-applications`,
  );

  // Matched by the animal link's href, not its displayed name — several
  // seeded animals share a name. Also requires a status cell reading exactly
  // "Pending" (not hasText, which would match that word anywhere in the row's
  // text): the row is this test's own just-created application, and staff
  // create already refuses a second active application for the same person
  // and animal, so "Pending" rules out an old closed/rejected/withdrawn row
  // for the same animal that the id alone would not.
  const applicationRow = page
    .locator("tbody tr")
    .filter({ has: page.locator(`a[href="/dashboard/animals/${animal.id}"]`) })
    .filter({ has: page.getByText("Pending", { exact: true }) });
  await expect(applicationRow).toBeVisible();
  await openRowMenuItem(applicationRow, "Review");
  await waitForPathname(page, REVIEW_PATH);

  await chooseFromSelect(page, "Application Status *", "Approved");
  await fillStable(
    page.getByLabel("Reason for Status Change *", { exact: true }),
    "Approved ahead of a foster-to-adopt conversion.",
  );
  await page.getByRole("button", { name: "Update Application" }).click();
  await expect(
    page.getByText("Application updated successfully."),
  ).toBeVisible();

  // The foster-to-adopt placement, for the same foster and animal. Picked by
  // id for the same reason as pickApplicationAnimal above: this combobox's
  // CommandItem value is `${name} ${species} ${id}` (animal-combobox.tsx), so
  // its data-value always contains the id regardless of name collisions.
  await page.goto(placementFormUrl);
  await page.getByRole("combobox", { name: /animal/i }).click();
  await page.getByPlaceholder("Search animals…").fill(animal.name);
  const placementAnimalOption = page.locator(
    `[cmdk-item][data-value*="${animal.id}"]`,
  );
  await expect(placementAnimalOption).toBeVisible();
  await placementAnimalOption.click();
  await chooseFromSelect(page, "Placement Type *", "Foster To Adopt");
  await page.getByRole("button", { name: "Place in Foster" }).click();
  await expect(page.getByText("Placement created.")).toBeVisible();
  await page.waitForURL("**/dashboard/animals/**");

  await banner(page).getByRole("link", { name: "Convert to Adoption" }).click();
  await page.waitForURL("**/convert");

  // With exactly one approved application on offer, the form pre-selects it
  // — asserted checked *without* clicking first, so this fails if that
  // default regresses instead of masking it.
  const applicationRadio = page.getByRole("radio", {
    name: `${fosterPersonName}'s application`,
  });
  await expect(applicationRadio).toBeChecked();

  await page.getByRole("button", { name: "Convert to Adoption" }).click();
  await page.getByRole("button", { name: "Confirm & Convert" }).click();
  await expect(
    page.getByText("Foster placement converted to adoption."),
  ).toBeVisible();

  // The linked application now reads Adopted on the staff table. Several
  // seeded animals share the name "Charlie", so the row is found by the
  // application's unique email rather than the animal's name.
  await page.goto(
    `/dashboard/adoption-applications?query=${encodeURIComponent(
      fosterPersonName,
    )}&pageSize=20`,
  );
  await expect(page.getByText(/of \d+ row\(s\) selected/)).toBeVisible();
  const staffRow = page
    .locator("tbody tr")
    .filter({ hasText: applicantEmail });
  await expect(staffRow).toBeVisible();
  await expect(
    staffRow.getByText("Adopted", { exact: true }).first(),
  ).toBeVisible();
});
