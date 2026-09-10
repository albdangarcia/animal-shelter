import { test, expect, type Page } from "@playwright/test";
import {
  adminStatePath,
  bootstrapAdminAuth,
  fillStable,
  firstRowIdByQuery,
} from "../support/note-audit";

// Recording an assessment, then editing it — the edit must preserve every
// answer the user didn't touch. That is the regression the previous build
// failed: it deleted the whole answer set on every save and rebuilt it from
// whatever the form repopulated.
//
// Fixtures: prisma/seed.ts gives Frisco (a dog, in care) three assessments
// already; this spec adds a Handling Sensitivity one through the UI.

const storageState = adminStatePath("assessments");

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

const friscoId = (page: Page) =>
  firstRowIdByQuery(page, "/dashboard/animals", "Frisco");

const pickOption = async (page: Page, label: string, option: string) => {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

const firstItem = (page: Page) =>
  page.locator('[data-slot="accordion-item"]').first();

const expandFirst = async (page: Page) => {
  const item = firstItem(page);
  const trigger = item.locator('[data-slot="accordion-trigger"]');
  await expect(async () => {
    if ((await trigger.getAttribute("data-state")) !== "open") {
      await trigger.click();
    }
    await expect(
      item.locator('[data-slot="accordion-content"]'),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return item;
};

const findingValue = (item: ReturnType<typeof firstItem>, question: string) =>
  item.locator("li", { hasText: question }).locator("p").first();

test("record an assessment, then edit it without losing answers", async ({
  page,
}) => {
  const id = await friscoId(page);
  const summary = `E2E handling assessment ${Date.now()}`;

  await page.goto(`/dashboard/animals/${id}/assessments/create`);
  await pickOption(page, "Template", "Handling Sensitivity");

  await pickOption(page, "Collar and leash application *", "Accepts readily");
  await pickOption(page, "Gentle restraint for exam", "Tolerates");
  await pickOption(page, "Overall handling sensitivity *", "Low");

  // A per-answer note that the later edit must not drop.
  await fillStable(
    page.getByLabel("Note (optional)").first(),
    "Calm for the collar",
  );
  await fillStable(page.getByLabel("Summary"), summary);

  await page.getByRole("button", { name: "Record assessment" }).click();
  await expect(page.getByText("Assessment recorded.")).toBeVisible();
  await page.waitForURL(`**/dashboard/animals/${id}/assessments`);

  // The new record is newest, so first in the default sort.
  let item = await expandFirst(page);
  await expect(item).toContainText("Handling Sensitivity");
  await expect(
    findingValue(item, "Collar and leash application"),
  ).toHaveText("Accepts readily");
  await expect(item).toContainText("Calm for the collar");

  // Edit: change one answer, leave the rest alone.
  await item.getByRole("button", { name: "Assessment actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.waitForURL(/\/assessments\/[^/]+\/edit$/);

  // The template picker is locked to what was recorded (plain text, no combobox).
  await expect(page.locator("#template-picker")).toHaveText(
    /Handling Sensitivity/,
  );
  await pickOption(page, "Overall handling sensitivity *", "Moderate");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Assessment updated.")).toBeVisible();
  await page.waitForURL(`**/dashboard/animals/${id}/assessments`);

  item = await expandFirst(page);
  // The changed answer took...
  await expect(
    findingValue(item, "Overall handling sensitivity"),
  ).toHaveText("Moderate");
  // ...and every untouched answer, plus the note, survived the edit.
  await expect(
    findingValue(item, "Collar and leash application"),
  ).toHaveText("Accepts readily");
  await expect(
    findingValue(item, "Gentle restraint for exam"),
  ).toHaveText("Tolerates");
  await expect(item).toContainText("Calm for the collar");
  await expect(item).toContainText(summary);
});

test("a blank assessment cannot be submitted", async ({ page }) => {
  const id = await friscoId(page);
  await page.goto(`/dashboard/animals/${id}/assessments/create`);
  await pickOption(page, "Template", "Intake Medical");

  await page.getByRole("button", { name: "Record assessment" }).click();

  // Stays on the form, and the required core-exam questions are flagged
  // (Intake Medical had every field optional after the weight/BCS removal —
  // dental and heart & lungs were made required to close that hole).
  await expect(page).toHaveURL(/\/assessments\/create$/);
  await expect(page.getByText("Dental is required.")).toBeVisible();
  await expect(
    page.getByText("Heart & lungs on auscultation is required."),
  ).toBeVisible();
});
