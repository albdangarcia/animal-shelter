import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  fillStable,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// A species, breed or color deleted in Settings → Animal Taxonomy is no longer
// offered on the animal form. Every case of the rule (species, breeds, colors,
// the save's refusal) is in prisma/animal-taxonomy.test.ts; these show the
// pages are wired to it. Every species, breed and color here is the test's
// own, so no other spec loses one it picks.

const adminPassword = process.env.ADMIN_PASSWORD;
const storageStatePath = storageStatePathFor("deleted-taxonomy.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the deleted taxonomy E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

test.use({ storageState: storageStatePath });

const TAXONOMY_PATH = "/dashboard/settings/animal-taxonomy";

const toast = (page: Page, message: string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: message }).first();

const section = (page: Page, title: string) =>
  page.locator("[data-slot=card]").filter({
    has: page.locator("[data-slot=card-title]", { hasText: new RegExp(`^${title}$`) }),
  });

const chip = (card: Locator, name: string) =>
  card
    .locator("div.rounded-md.border")
    .filter({ has: card.page().getByText(name, { exact: true }) });

const chipMenu = async (card: Locator, name: string, item: string) => {
  await chip(card, name).getByRole("button").click();
  await card.page().getByRole("menuitem", { name: item }).click();
};

// A Radix select can drop a click that lands before hydration settles;
// re-clicking an open one would shut it, so click again only while closed.
const choose = async (scope: Page | Locator, page: Page, label: string, option: string) => {
  const choice = page.getByRole("option", { name: option, exact: true });
  await expect(async () => {
    if (!(await choice.isVisible())) {
      await scope.getByLabel(label, { exact: true }).click();
    }
    await expect(choice).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await choice.click();
};

// Wait for a closing list to leave: its options can match the next pick.
const chooseAndClose = async (scope: Page | Locator, page: Page, label: string, option: string) => {
  await choose(scope, page, label, option);
  await expect(page.getByRole("option")).toHaveCount(0);
};

const addNamed = async (page: Page, kind: "Color" | "Species", name: string) => {
  const card = section(page, kind === "Color" ? "Colors" : "Species");
  await card.getByRole("button", { name: `Add ${kind}` }).click();
  const dialog = page.getByRole("dialog", { name: `Add ${kind}` });
  await fillStable(dialog.getByLabel("Name"), name);
  await dialog.getByRole("button", { name: `Create ${kind}` }).click();
  await expect(toast(page, `${kind} created successfully.`)).toBeVisible();
  await expect(chip(card, name)).toBeVisible();
};

test("a deleted color is not offered on the Add Animal form", async ({ page }) => {
  const colorName = `E2E Color ${Date.now()}`;

  await page.goto(TAXONOMY_PATH);
  await addNamed(page, "Color", colorName);
  const colors = section(page, "Colors");
  await chipMenu(colors, colorName, "Delete");
  await expect(toast(page, "Color deleted successfully.")).toBeVisible();
  await expect(chip(colors, colorName).getByText("Deleted")).toBeVisible();

  await page.goto("/dashboard/animals/create");
  await expect(async () => {
    await page.getByLabel("Primary Color").click();
    await expect(page.getByRole("option", { name: "Black" })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole("option", { name: colorName })).toHaveCount(0);
});

test("an animal's deleted colors and a breed moved to another species start empty on its edit form", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const species = `E2E Species ${stamp}`;
  const otherSpecies = `E2E Other Species ${stamp}`;
  const breed = `E2E Breed ${stamp}`;
  const primary = `E2E Primary ${stamp}`;
  const additional = `E2E Additional ${stamp}`;
  const animalName = `Taxonomy edit ${stamp}`;

  // The test's own species, breed and colors.
  await page.goto(TAXONOMY_PATH);
  await addNamed(page, "Species", species);
  await addNamed(page, "Species", otherSpecies);
  await addNamed(page, "Color", primary);
  await addNamed(page, "Color", additional);
  const breeds = section(page, "Breeds");
  await breeds.getByRole("button", { name: "Add Breed" }).click();
  const addBreed = page.getByRole("dialog", { name: "Add Breed" });
  await chooseAndClose(addBreed, page, "Species *", species);
  await fillStable(addBreed.getByLabel("Name"), breed);
  await addBreed.getByRole("button", { name: "Create Breed" }).click();
  await expect(toast(page, "Breed created successfully.")).toBeVisible();

  // An animal that has them.
  await page.goto("/dashboard/animals/create");
  await fillStable(page.getByLabel("Animal Name *", { exact: true }), animalName);
  await chooseAndClose(page, page, "Species *", species);
  await chooseAndClose(page, page, "Breed *", breed);
  await chooseAndClose(page, page, "Primary Color *", primary);
  // A multi-select: its list stays open until Esc.
  await choose(page, page, "Additional Colors", additional);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await chooseAndClose(page, page, "Intake Type *", "Seize");
  const birthCalendar = page.getByRole("dialog");
  await expect(async () => {
    if (!(await birthCalendar.isVisible())) {
      await page.getByRole("button", { name: /^Estimated Birth Date \*:/ }).click();
    }
    await expect(birthCalendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await birthCalendar.locator("button[data-day]:not([disabled])").nth(0).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create Intake" }).click();
  await expect(toast(page, "Animal intake created successfully.")).toBeVisible();
  await waitForPathname(page, "/dashboard/animals");
  const animalHref = await page
    .locator("tbody")
    .getByRole("link", { name: animalName, exact: true })
    .getAttribute("href");

  // Both colors deleted, and the breed moved to the other species.
  await page.goto(TAXONOMY_PATH);
  for (const color of [primary, additional]) {
    await chipMenu(section(page, "Colors"), color, "Delete");
    await expect(chip(section(page, "Colors"), color).getByText("Deleted")).toBeVisible();
  }
  await chipMenu(breeds, breed, "Edit");
  const editBreed = page.getByRole("dialog", { name: "Edit Breed" });
  await chooseAndClose(editBreed, page, "Species *", otherSpecies);
  await editBreed.getByRole("button", { name: "Update Breed" }).click();
  await expect(toast(page, "Breed updated successfully.")).toBeVisible();

  // The form holds nothing the user can't see: each starts empty.
  await page.goto(`${animalHref}/edit`);
  await expect(page.getByLabel("Species *", { exact: true })).toHaveText(species);
  await expect(page.getByLabel("Breed *", { exact: true })).toHaveText("Select a breed");
  await expect(page.getByLabel("Primary Color *", { exact: true })).toHaveText(
    "Select a color",
  );
  await expect(page.getByLabel("Additional Colors", { exact: true })).toHaveText(
    "Select colors",
  );
  await expect(page.getByText(additional, { exact: true })).toHaveCount(0);
});
