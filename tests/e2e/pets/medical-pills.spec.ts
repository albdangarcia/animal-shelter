import { expect, test, type Page } from "@playwright/test";

// /pets is public — no auth setup needed.
//
// A pet page's "Neutered" and "Microchipped" pills are read from the animal's
// medical record. Which entries count (a spay given, a chip carried, never a
// voided or scheduled one) is covered by the database tests; this spec keeps
// what only the page shows: that the pills follow the record, and that an
// exemption from a spay or neuter never reads as "Neutered".
//
// The seed spays Whiskers in house and records a neuter exemption for
// Godzilla, and both carry a chip. No spec gives either an outcome, so both
// stay listed.

const openPetPage = async (page: Page, name: string) => {
  await page.goto(`/pets?query=${name}`);
  await page.getByRole("link", { name: new RegExp(name) }).first().click();
  await page.waitForURL(/\/pets\/[^/?]+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
};

// The pills sit under the "Personality & Needs" heading, beside the
// characteristics.
const pills = (page: Page) =>
  page
    .getByRole("heading", { name: "Personality & Needs" })
    .locator("xpath=..");

test("the pet pages show Neutered and Microchipped from the medical record", async ({
  page,
}) => {
  await openPetPage(page, "Whiskers");
  await expect(pills(page).getByText("Neutered", { exact: true })).toBeVisible();
  await expect(
    pills(page).getByText("Microchipped", { exact: true }),
  ).toBeVisible();

  // Exempt from a neuter, not neutered: only the chip shows.
  await openPetPage(page, "Godzilla");
  await expect(
    pills(page).getByText("Microchipped", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Neutered", { exact: true })).toHaveCount(0);
});
