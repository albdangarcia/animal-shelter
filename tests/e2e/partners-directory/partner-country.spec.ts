import { test, expect, type Page } from "@playwright/test";
import {
  adminStatePath,
  bootstrapAdminAuth,
  fillStable,
} from "../support/note-audit";

// Which country and state a partner is saved with, for each combination, is
// covered by prisma/partner-country.test.ts and the schema's unit test. This
// shows the Add and Edit Partner forms are wired to it: State goes away and
// is cleared when another country is picked, and the partner's page and the
// list show the country.

const storageState = adminStatePath("partner-country");

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

const NAME = `Harbour Rescue ${Date.now().toString(36)}`;

const pick = async (page: Page, label: RegExp, option: string) => {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

test("a partner outside the US gets a country and loses its state", async ({ page }) => {
  await page.goto("/dashboard/partners-directory/new");
  await expect(page.getByText("New Partner", { exact: true })).toBeVisible();
  await fillStable(page.getByLabel("Name", { exact: false }).first(), NAME);
  await pick(page, /Type/, "Rescue Group");
  await fillStable(page.getByLabel("City"), "Halifax");

  // A new partner starts in the United States, with a State to pick.
  const country = page.getByRole("combobox", { name: /Country/ });
  const state = page.getByRole("combobox", { name: /^State/ });
  await expect(country).toHaveText("United States");
  await pick(page, /^State/, "Maine");

  // Another country hides State; picking the US again brings it back, empty.
  await pick(page, /Country/, "Canada");
  await expect(state).toHaveCount(0);
  await pick(page, /Country/, "United States");
  await expect(state).toHaveText("Select a state");
  await pick(page, /Country/, "Canada");

  await page.getByRole("button", { name: "Create Partner" }).click();
  await page.waitForURL((url) =>
    /^\/dashboard\/partners-directory\/(?!new$)[a-z0-9]+$/.test(url.pathname),
  );
  const partnerId = new URL(page.url()).pathname.split("/").pop() as string;

  // The partner's page ends its address with the country, and has no state.
  await expect(page.getByText("Halifax, Canada", { exact: true })).toBeVisible();

  // The edit form opens on the country, with State hidden.
  await page.goto(`/dashboard/partners-directory/${partnerId}/edit`);
  await expect(page.getByRole("combobox", { name: /Country/ })).toHaveText("Canada");
  await expect(page.getByRole("combobox", { name: /^State/ })).toHaveCount(0);

  // The list shows the country where a US partner shows its state.
  await page.goto(`/dashboard/partners-directory?query=${encodeURIComponent(NAME)}`);
  const row = page.getByRole("row").filter({ hasText: NAME });
  await expect(row).toContainText("Canada");
  await expect(page.getByRole("columnheader", { name: /State \/ Country/ })).toBeVisible();
});
