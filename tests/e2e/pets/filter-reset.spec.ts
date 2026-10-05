import { expect, test, type Page } from "@playwright/test";

// /pets is public — no auth setup needed.
//
// What each filter control writes, and that it follows a URL it did not change
// (a Reset), is checked in the component tests:
// components/table-common/server-side-filters.test.tsx (the faceted filters and
// the sort, shared with every list) and
// components/public-pages/pets/pets-filters.test.tsx (the species pills, the
// search box, Reset). This spec keeps what only the real page shows: that it
// gives each control the parameter its server reads, and that the Next router's
// back button leaves a control matching the URL.
//
// These assertions are deliberately about the CONTROLS and the URL, never about
// the filtered pet cards: the seed's per-species counts vary a lot run to run
// (one seed gives 3 birds, another 11), so "expect N bird cards" is flaky by
// construction.

// Every species row is seeded unconditionally in prisma/seed.ts
// (seedLookupTables creates Dog/Cat/Bird/Rabbit/Reptile/Other regardless of how
// many animals the run generates), so these pills are always in the row.
//
// Species is a pill row rather than a dropdown. The pressed
// pill is the control's state, so that is what these assertions read.
const speciesPill = (page: Page, name: string) =>
  page
    .getByRole("group", { name: "Species" })
    .getByRole("button", { name, exact: true });

const selectSpecies = async (page: Page, name: string) => {
  await speciesPill(page, name).click();
};
const sortTrigger = (page: Page) =>
  page.getByRole("combobox", { name: "Sort by:" });
// Match the faceted-filter buttons in both states: unfiltered the accessible
// name is exactly "Color"; with a selection it becomes "Color <badge>".
const facetButton = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(`^${title}`) });

// Every parameter /pets reads, in its control: the page passes each control
// the `paramKey` its server reads. Reset is a client navigation, so the same
// controls re-render with the bare URL without remounting; one that kept its
// own state would go on showing its filter. The grid may be empty with every
// filter on: only the controls are read.
test("every filter in the URL shows in its control, and Reset clears them all", async ({
  page,
}) => {
  // "Black" is seeded unconditionally.
  await page.goto(
    "/pets?category=Dog&color=Black&sex=MALE&size=SMALL&sort=createdAt.asc&query=bud",
  );

  await expect(speciesPill(page, "Dog")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // At this viewport the trigger shows its selection's labels. Case-sensitive,
  // so "Male" does not match "Female".
  await expect(facetButton(page, "Color")).toContainText("Black");
  await expect(facetButton(page, "Sex")).toContainText("Male");
  await expect(facetButton(page, "Size")).toContainText("Small");
  // "Oldest", not "Oldest pets".
  await expect(sortTrigger(page)).toHaveText("Oldest");
  await expect(page.getByRole("searchbox")).toHaveValue("bud");

  await page.getByRole("button", { name: "Reset" }).click();
  await page.waitForURL(
    (url) => url.pathname === "/pets" && url.search === "",
  );

  // Every control reads as unfiltered.
  await expect(speciesPill(page, "All")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(speciesPill(page, "Dog")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(facetButton(page, "Color")).toHaveText("Color");
  await expect(facetButton(page, "Sex")).toHaveText("Sex");
  await expect(facetButton(page, "Size")).toHaveText("Size");
  await expect(sortTrigger(page)).toHaveText("Newest"); // options[0], the default
  await expect(page.getByRole("searchbox")).toHaveValue("");
});

test("navigating to a pet detail page and back leaves the control matching the URL", async ({
  page,
}) => {
  await page.goto("/pets");

  // Dog guarantees at least one published card (prisma/seed.ts hand-authors
  // several IN_CARE dogs independent of the procedurally generated animals).
  await selectSpecies(page, "Dog");
  await page.waitForURL((url) => url.searchParams.get("category") === "Dog");
  await expect(speciesPill(page, "Dog")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.locator('main a[href^="/pets/"]').first().click();
  await page.waitForURL((url) => /^\/pets\/[^/]+$/.test(url.pathname));

  await page.goBack();
  await page.waitForURL((url) => url.searchParams.get("category") === "Dog");

  // Same class of bug: the control must reflect the URL it came back to.
  await expect(speciesPill(page, "Dog")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
