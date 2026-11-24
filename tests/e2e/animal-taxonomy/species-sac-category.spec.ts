import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  fillStable,
  storageStatePathFor,
} from "../support/applications";

// The species form is wired to a species' Shelter Animals Count category: it
// saves the one picked, shows it on the species' chip, starts the edit form on
// it, and clears it. Every case of what is stored is in
// prisma/settings-catalog.test.ts. The species is the test's own.

const adminPassword = process.env.ADMIN_PASSWORD;
const storageStatePath = storageStatePathFor("species-sac-category.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the species SAC category E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

test.use({ storageState: storageStatePath });

const LABEL = "Shelter Animals Count category";

const toast = (page: Page, message: string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: message }).first();

const speciesChip = (page: Page, name: string) =>
  page
    .locator("[data-slot=card]")
    .filter({
      has: page.locator("[data-slot=card-title]", { hasText: /^Species$/ }),
    })
    .locator("div.rounded-md.border")
    .filter({ has: page.getByText(name, { exact: true }) });

// A Radix select can drop a click that lands before hydration settles;
// re-clicking an open one would shut it, so click again only while closed.
const choose = async (dialog: Locator, option: string) => {
  const page = dialog.page();
  const choice = page.getByRole("option", { name: option, exact: true });
  await expect(async () => {
    if (!(await choice.isVisible())) {
      await dialog.getByLabel(LABEL, { exact: true }).click();
    }
    await expect(choice).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await choice.click();
  await expect(page.getByRole("option")).toHaveCount(0);
};

test("a species is given a Shelter Animals Count category, and cleared of it", async ({
  page,
}) => {
  const name = `E2E SAC Species ${Date.now()}`;

  await page.goto("/dashboard/settings/animal-taxonomy");
  await page.getByRole("button", { name: "Add Species" }).first().click();
  const add = page.getByRole("dialog", { name: "Add Species" });
  await fillStable(add.getByLabel("Name"), name);
  await choose(add, "Small mammals");
  await add.getByRole("button", { name: "Create Species" }).click();
  await expect(toast(page, "Species created successfully.")).toBeVisible();
  await expect(speciesChip(page, name)).toContainText("Small mammals");

  await speciesChip(page, name).getByRole("button").click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Species" });
  await expect(edit.getByLabel(LABEL, { exact: true })).toHaveText("Small mammals");
  await choose(edit, "Not reported");
  await edit.getByRole("button", { name: "Update Species" }).click();
  await expect(toast(page, "Species updated successfully.")).toBeVisible();
  await expect(speciesChip(page, name)).toContainText("Not reported to SAC");
});
