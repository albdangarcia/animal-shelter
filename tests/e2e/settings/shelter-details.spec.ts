import { test, expect } from "@playwright/test";
import { adminStatePath, bootstrapAdminAuth } from "../support/note-audit";

// The rule (a US state code, saved on the one settings row, created when
// missing) is covered by prisma/shelter-details.test.ts and the schema's unit
// test. This shows the page is wired: Settings links to it, the form saves,
// and the card reads the new state. The seed's state is put back at the end.

const storageState = adminStatePath("shelter-details");

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

test("an admin sets the shelter's state from Settings", async ({ page }) => {
  await page.goto("/dashboard/settings");
  await page.getByRole("link", { name: /Shelter Details/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/shelter-details$/);

  const card = page.locator('[data-slot="card"]').filter({ hasText: "Shelter Details" });
  const edit = page.getByRole("button", { name: "Edit shelter details" });
  const dialog = page.getByRole("dialog", { name: "Edit Shelter Details" });
  const state = dialog.getByRole("combobox", { name: /State/ });

  const save = async (name: string) => {
    await edit.click();
    await state.click();
    await page.getByRole("option", { name, exact: true }).click();
    await dialog.getByRole("button", { name: "Save Shelter Details" }).click();
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: "Shelter details saved." }),
    ).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(card.getByRole("definition")).toHaveText(name);
  };

  // The seed puts the shelter in New York.
  await expect(card.getByRole("definition")).toHaveText("New York");
  try {
    await save("Vermont");
    // It is read from the database, not the page: a reload still shows it.
    await page.reload();
    await expect(card.getByRole("definition")).toHaveText("Vermont");
  } finally {
    await save("New York");
  }
});
