import { expect, test, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// The staff Help pages, read against the guides in docs/guides/. Who sees
// which guide, the search ranking, link rewriting and the anchor check are
// covered by the unit tests in app/lib/guides/. This is what only a browser
// can show: a search, a guide and its links working end to end, that a
// foster's Help holds only the foster guide and a staff guide's URL is
// not-found for them, and that the "?" on a page opens its guide.

const staffState = storageStatePathFor("help-pages-staff.state.json");
const fosterState = storageStatePathFor("help-pages-foster.state.json");

const VACCINE_GUIDE = "Record a vaccine, test or treatment";
const DUE_GUIDE = "Schedule care and read the Due page";
const FOSTER_GUIDE = "Fosters: give care and report an outside vet visit";

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "staff1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: staffState,
  });
  await bootstrapStorageState(browser, {
    email: "foster1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: fosterState,
  });
});

const guideTitle = (page: Page, title: string) =>
  page.getByRole("heading", { level: 1, name: title });

// The header names the section ("Help") in an h1 of its own, so the index
// is recognised by its search box.
const searchBox = (page: Page) =>
  page.getByRole("searchbox", { name: "Search help" });

const guideList = (page: Page) =>
  page.getByRole("list", { name: /^(Matching guides|Guides)$/ });

test.describe("staff", () => {
  test.use({ storageState: staffState });

  test("search for staff's own words, open the guide, follow a link to another guide and to a glossary heading", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // The sidebar entry.
    await page.getByRole("link", { name: "Help", exact: true }).click();
    await waitForPathname(page, "/dashboard/help");

    // "give a shot" is an alias, in none of the guide's title, summary or
    // body.
    await searchBox(page).fill("give a shot");
    await expect(page).toHaveURL(/\?q=give\+a\+shot$/);
    const results = guideList(page).getByRole("listitem");
    await expect(results.first()).toContainText(VACCINE_GUIDE);

    await results.first().getByRole("link", { name: VACCINE_GUIDE }).click();
    await waitForPathname(page, "/dashboard/help/record-a-vaccine-test-or-treatment");
    await expect(guideTitle(page, VACCINE_GUIDE)).toBeVisible();
    await expect(page.getByText(/^Last checked [A-Z][a-z]{2} \d{1,2}, \d{4}$/)).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Related guides" }).getByRole("link", { name: DUE_GUIDE }),
    ).toBeVisible();

    // `./schedule-care-and-read-the-due-page.md` in the guide, rewritten.
    const article = page.getByRole("article", { name: VACCINE_GUIDE });
    await article.getByRole("link", { name: DUE_GUIDE }).click();
    await waitForPathname(page, "/dashboard/help/schedule-care-and-read-the-due-page");
    await expect(guideTitle(page, DUE_GUIDE)).toBeVisible();

    // `./medical-status-glossary.md#overdue`: the page, scrolled to the
    // heading the anchor names.
    await page
      .getByRole("article", { name: DUE_GUIDE })
      .getByRole("link", { name: "glossary", exact: true })
      .click();
    await waitForPathname(page, "/dashboard/help/medical-status-glossary");
    await expect(page).toHaveURL(/#overdue$/);
    const overdue = page.getByRole("heading", { name: "Overdue", exact: true });
    await expect(overdue).toHaveAttribute("id", "overdue");
    await expect(overdue).toBeInViewport();
  });

  test("the \"?\" on the Due page opens the Due guide", async ({ page }) => {
    await page.goto("/dashboard/medical/due");
    await page.getByRole("link", { name: `Help: ${DUE_GUIDE}` }).click();

    await waitForPathname(page, "/dashboard/help/schedule-care-and-read-the-due-page");
    await expect(guideTitle(page, DUE_GUIDE)).toBeVisible();
  });
});

test.describe("a foster", () => {
  test.use({ storageState: fosterState });

  test("sees only the foster guide, and a staff guide's URL is not found", async ({ page }) => {
    await page.goto("/dashboard/help");
    await expect(searchBox(page)).toBeVisible();

    const results = guideList(page).getByRole("listitem");
    await expect(results).toHaveCount(1);
    await expect(results.first()).toContainText(FOSTER_GUIDE);

    // A staff guide answers exactly like a guide that doesn't exist.
    await page.goto("/dashboard/help/record-a-vaccine-test-or-treatment");
    await expect(guideTitle(page, "Guide Not Found")).toBeVisible();
    await expect(page.getByText(VACCINE_GUIDE)).toHaveCount(0);

    await page.goto("/dashboard/help/no-such-guide");
    await expect(guideTitle(page, "Guide Not Found")).toBeVisible();
  });
});
