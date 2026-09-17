import { test, expect, type Page } from "@playwright/test";
import {
  APPLICANT_EMAIL,
  APPLICANT_NAME,
  MY_APPLICATIONS_PATH,
  SEEDED_USER_PASSWORD,
  bootstrapStorageState,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// The ⌘K palette, read against the seed alone.
//
// Every fixture asserted here is one nothing else in a full run touches:
// - "Godzilla" is a hand-authored in-care iguana, the only animal with that
//   name, and no nav page title contains it — so he is the highlighted row
//   the moment he appears, which is what makes the Enter case meaningful.
// - "Jane Doe" holds the ten hand-seeded adoption applications
//   (`seedRegisteredUserApplicationFixtures`) and is kept out of every random
//   applicant pool; neither "Jane" nor "Doe" is in the walk-in name pools, so
//   the query names exactly one person.
// She is also the adopter: a USER account holds none of the five search
// permissions, so she is who the hidden-search case needs.

const ANIMAL_NAME = "Godzilla";

// `GLOBAL_SEARCH_GROUP_LIMIT`. Jane has ten applications, so her group is
// capped rather than complete — that cap is the assertion.
const GROUP_LIMIT = 5;

const staffState = storageStatePathFor("global-search-staff.state.json");
const adopterState = storageStatePathFor("global-search-adopter.state.json");

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "staff1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: staffState,
  });
  await bootstrapStorageState(browser, {
    email: APPLICANT_EMAIL,
    password: SEEDED_USER_PASSWORD,
    storageStatePath: adopterState,
  });
});

/** The dialog's only accessible name comes from its sr-only title. */
const palette = (page: Page) => page.getByRole("dialog", { name: "Search" });

const searchInput = (page: Page) =>
  palette(page).getByPlaceholder(
    "Search animals, people, partners, applications…",
  );

// cmdk marks headings with an attribute rather than a heading role, and they
// are `aria-hidden` — so match the attribute, exactly, or "People" would also
// find "People Directory".
const groupHeading = (page: Page, heading: string) =>
  palette(page).locator("[cmdk-group-heading]", {
    hasText: new RegExp(`^${heading}$`),
  });

// Rows carry their own href, which is also how the palette reads one back for
// ⌘+Enter. Matching on it picks a group without depending on row text: an
// application on an animal named "Godzilla" would otherwise answer to the
// same query as the animal.
const rowsUnder = (page: Page, pathPrefix: string) =>
  palette(page).locator(`[cmdk-item][data-href^="${pathPrefix}"]`);

const themeToggle = (page: Page) =>
  page.getByRole("button", { name: "Toggle theme" });

const searchBar = (page: Page) => page.getByRole("button", { name: "Search" });

/**
 * The shortcut listener is registered in an effect and the search bar's
 * onClick needs React attached, so either one lands on nothing until the page
 * has hydrated. Retry until the dialog is actually up.
 *
 * ⌘K toggles, so a retry could in principle close a dialog that opened
 * slowly — the window below is an order of magnitude longer than the open
 * animation, which is the only thing between the press and a visible dialog.
 */
const openPalette = async (page: Page, via: "shortcut" | "search bar") => {
  await expect(async () => {
    if (via === "shortcut") {
      await page.keyboard.press("ControlOrMeta+k");
    } else {
      await searchBar(page).click();
    }
    await expect(palette(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
};

test.describe("staff", () => {
  test.use({ storageState: staffState });

  test("⌘K, a name, Enter — and the animal's page", async ({ page }) => {
    await page.goto("/dashboard/animals");
    await expect(themeToggle(page)).toBeVisible();

    await openPalette(page, "shortcut");
    await searchInput(page).fill(ANIMAL_NAME);

    const animalRow = rowsUnder(page, "/dashboard/animals/");
    await expect(animalRow).toHaveCount(1);
    // Nothing above him, so cmdk highlights him — which is what Enter takes.
    await expect(animalRow).toHaveAttribute("aria-selected", "true");
    const href = await animalRow.getAttribute("data-href");
    expect(href).toBeTruthy();

    await page.keyboard.press("Enter");
    await waitForPathname(page, href!);
    // The close is animated, so the dialog outlives the navigation.
    await expect(palette(page)).toBeHidden();
    await expect(
      page.getByText(ANIMAL_NAME, { exact: true }).first(),
    ).toBeVisible();
  });

  test("a person and their applications, in separate groups", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(themeToggle(page)).toBeVisible();

    await openPalette(page, "shortcut");
    await searchInput(page).fill("Jane");

    await expect(groupHeading(page, "People")).toBeVisible();
    const personRows = rowsUnder(page, "/dashboard/people-directory/");
    await expect(personRows).toHaveCount(1);
    await expect(personRows).toContainText(APPLICANT_NAME);

    await expect(groupHeading(page, "Adoption applications")).toBeVisible();
    const applicationRows = rowsUnder(page, "/dashboard/adoption-applications/");
    await expect(applicationRows).toHaveCount(GROUP_LIMIT);
    await expect(applicationRows.first()).toContainText(APPLICANT_NAME);
  });

  test("the header search bar opens the palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(searchBar(page)).toBeVisible();

    await openPalette(page, "search bar");
    // An empty query costs no request, so Pages is the whole palette here: a
    // keyboard navigator over the destinations this viewer can open.
    await expect(groupHeading(page, "Pages")).toBeVisible();
    await expect(
      palette(page).locator('[cmdk-item][data-href="/dashboard/animals"]'),
    ).toBeVisible();
    await expect(groupHeading(page, "People")).toHaveCount(0);
  });

  test("Esc closes the palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(themeToggle(page)).toBeVisible();

    await openPalette(page, "shortcut");
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
  });
});

test.describe("an adopter", () => {
  test.use({ storageState: adopterState });

  test("gets no search bar and no shortcut", async ({ page }) => {
    await page.goto(MY_APPLICATIONS_PATH);
    // The bar's own slot in the header, so its absence is a missing button
    // rather than a header that has not rendered.
    await expect(themeToggle(page)).toBeVisible();
    await expect(searchBar(page)).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+k");
    // A non-event: there is nothing to wait for if the shortcut is inert, so
    // give a dialog a window to appear in and then require that none did.
    await page.waitForTimeout(1_000);
    await expect(palette(page)).toHaveCount(0);
  });
});
