import { expect, test, type Page } from "@playwright/test";

// /pets is public — no auth setup needed.
//
// These assertions are deliberately about the CONTROLS and the URL, never about
// the filtered pet cards: the seed's per-species counts vary a lot run to run
// (one seed gives 3 birds, another 11), so "expect N bird cards" is flaky by
// construction. The bug under test is that a filter control keeps displaying a
// stale value after the server state (the URL) has moved on.

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

test("selecting a species then resetting clears the species dropdown", async ({
  page,
}) => {
  await page.goto("/pets");

  await selectSpecies(page, "Bird");
  await page.waitForURL((url) => url.searchParams.get("category") === "Bird");
  await expect(speciesPill(page, "Bird")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Reset" }).click();

  await page.waitForURL(
    (url) => url.pathname === "/pets" && url.search === "",
  );
  // The control must follow the URL back to the unfiltered state.
  await expect(speciesPill(page, "All")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(speciesPill(page, "Bird")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(new URL(page.url()).searchParams.has("category")).toBe(false);
});

test("resetting several filters at once clears every control", async ({
  page,
}) => {
  await page.goto("/pets");

  // Species (Radix Select)
  await selectSpecies(page, "Dog");
  await page.waitForURL((url) => url.searchParams.get("category") === "Dog");

  // Color (faceted popover) — "Black" is seeded unconditionally.
  await facetButton(page, "Color").click();
  await page.getByRole("option", { name: "Black", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("color") === "Black");
  await page.keyboard.press("Escape");

  // Sex (faceted popover) — exact, else "Male" also matches "Female".
  await facetButton(page, "Sex").click();
  await page.getByRole("option", { name: "Male", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("sex") === "MALE");
  await page.keyboard.press("Escape");

  // Size (faceted popover)
  await facetButton(page, "Size").click();
  await page.getByRole("option", { name: "Small", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("size") === "SMALL");
  await page.keyboard.press("Escape");

  // Sort (Radix Select) — "Oldest" is distinct from "Oldest pets".
  await sortTrigger(page).click();
  await page.getByRole("option", { name: "Oldest", exact: true }).click();
  await page.waitForURL(
    (url) => url.searchParams.get("sort") === "createdAt.asc",
  );

  // Search box (debounced input)
  await page.getByRole("searchbox").fill("bud");
  await page.waitForURL((url) => url.searchParams.get("query") === "bud");

  // Sanity check that the filters actually took before resetting.
  await expect(speciesPill(page, "Dog")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(sortTrigger(page)).toHaveText("Oldest");

  await page.getByRole("button", { name: "Reset" }).click();
  await page.waitForURL(
    (url) => url.pathname === "/pets" && url.search === "",
  );

  // Every control reads as unfiltered.
  await expect(speciesPill(page, "All")).toHaveAttribute(
    "aria-pressed",
    "true",
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
