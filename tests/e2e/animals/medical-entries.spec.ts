import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  fillStable,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";
import { firstRowIdByQuery } from "../support/note-audit";

// Every rule of recording, correcting and voiding medical entries is covered
// by the database tests (prisma/medical-entries.test.ts and
// prisma/medical-catalog.test.ts). These are the journeys only a browser can
// show: that the forms reach those rules, who sees which controls, and that
// the catalog's retirements reach the staff's picker.

const adminPassword = process.env.ADMIN_PASSWORD;

test.describe.configure({ mode: "serial" });

const staffStatePath = storageStatePathFor("medical-entries-staff.state.json");
const volunteerStatePath = storageStatePathFor(
  "medical-entries-volunteer.state.json",
);
const adminStatePath = storageStatePathFor("medical-entries-admin.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the medical entries E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "staff1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: staffStatePath,
  });
  await bootstrapStorageState(browser, {
    email: "volunteer1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: volunteerStatePath,
  });
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath: adminStatePath,
  });
});

const animalId = (page: Page, name: string) =>
  firstRowIdByQuery(page, "/dashboard/animals", name);

/** The Rabies line of the Overview's status. */
const rabiesLine = (page: Page) =>
  page
    .locator('dl[aria-label="Medical status"] div')
    .filter({ hasText: "Rabies" })
    .locator("dd");

/**
 * Opens a Radix menu and picks an item. The trigger can swallow the first
 * click before hydration settles, so retry, re-clicking only while the menu
 * is closed so it is never toggled shut.
 */
const pickFromMenu = async (page: Page, trigger: Locator, itemName: RegExp | string) => {
  const item = page.getByRole("menuitem", { name: itemName });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await item.isVisible())) {
      await trigger.click();
    }
    await expect(item).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await item.click();
};

/** One entry on a Medical page, found by its item and a distinctive text. */
const entryCard = (page: Page, itemName: string, text: string) =>
  page
    .locator("li[aria-label]")
    .filter({ hasText: itemName })
    .filter({ hasText: text });

test.describe("as staff", () => {
  test.use({ storageState: staffStatePath });

  test("recording, correcting and voiding a rabies vaccine", async ({
    page,
  }, testInfo) => {
    // A retry runs against the database the failed attempt wrote to, so each
    // attempt uses its own lot numbers and compares against what it found.
    const lot = `RB-E2E-${testInfo.retry}`;
    const correctedLot = `${lot}-B`;
    const id = await animalId(page, "Flash");

    await page.goto(`/dashboard/animals/${id}/medical`);
    const rabiesBefore = (await rabiesLine(page).innerText()).trim();

    await pickFromMenu(
      page,
      page.getByRole("button", { name: "Add entry" }),
      "Vaccine",
    );
    const dialog = page.getByRole("dialog", { name: "Record a vaccine" });
    await expect(
      dialog.getByRole("radiogroup", { name: "Given *" }),
    ).toBeVisible();
    await dialog.getByRole("combobox", { name: /^Vaccine/ }).click();
    await page.getByRole("option", { name: "Rabies 1-year" }).click();
    await fillStable(dialog.getByLabel("Lot number"), lot);
    await dialog.getByLabel("Rabies tag number").fill("T-E2E");
    await dialog.getByLabel(/Duration \(months\)/).fill("12");
    // Rabies 1-year repeats, so recording offers to schedule the next one.
    // This journey is about the record itself; scheduling has its own spec.
    await dialog.getByRole("checkbox", { name: "Schedule the next one" }).uncheck();
    await dialog.getByRole("button", { name: "Record Vaccine" }).click();
    await expect(dialog).toBeHidden();
    // Focus goes back to the menu's button, not to the page.
    await expect(page.getByRole("button", { name: "Add entry" })).toBeFocused();

    await expect(rabiesLine(page)).toHaveText(/^Valid until \w{3} \d{1,2}, \d{4}$/);
    const entry = entryCard(page, "Rabies 1-year", lot);
    await expect(entry).toContainText("Valid until:");

    // Correct the lot number; the history shows it before and after.
    await pickFromMenu(
      page,
      entry.getByRole("button", { name: /^Actions for Rabies 1-year/ }),
      "Edit",
    );
    const edit = page.getByRole("dialog", { name: "Edit vaccine" });
    // Trying another vaccine and coming back puts back what was recorded:
    // the history below shows the lot alone.
    const vaccinePicker = edit.getByRole("combobox", { name: /^Vaccine/ });
    await vaccinePicker.click();
    await page.getByRole("option", { name: "DHPP" }).click();
    await expect(edit.getByLabel("Rabies tag number")).toHaveCount(0);
    await vaccinePicker.click();
    await page.getByRole("option", { name: "Rabies 1-year" }).click();
    await expect(edit.getByLabel("Rabies tag number")).toHaveValue("T-E2E");
    const lotField = edit.getByLabel("Lot number");
    await fillStable(lotField, correctedLot);
    // Closing with unsaved changes asks first; Cancel goes back to the field.
    await page.keyboard.press("Escape");
    const discard = page.getByRole("alertdialog", {
      name: "Discard unsaved entry?",
    });
    await discard.getByRole("button", { name: "Cancel" }).click();
    await expect(discard).toBeHidden();
    await expect(lotField).toBeFocused();
    await edit.getByRole("button", { name: "Save Changes" }).click();
    await expect(edit).toBeHidden();
    const corrected = entryCard(page, "Rabies 1-year", correctedLot);
    await expect(
      corrected.getByRole("button", { name: /^Actions for Rabies 1-year/ }),
    ).toBeFocused();
    await corrected.getByRole("button", { name: "Show 1 change" }).click();
    await expect(
      corrected.getByRole("list", { name: "Change history" }),
    ).toContainText(`Lot number: ${lot} → ${correctedLot}`);

    // Void it. The reason is required, and the entry stops counting.
    await pickFromMenu(
      page,
      corrected.getByRole("button", { name: /^Actions for Rabies 1-year/ }),
      /Void/,
    );
    const voidDialog = page.getByRole("alertdialog");
    const voidButton = voidDialog.getByRole("button", { name: "Void Entry" });
    await expect(voidButton).toBeDisabled();
    await voidDialog
      .getByLabel("Reason for voiding")
      .fill("Entered against the wrong animal.");
    await voidButton.click();
    await expect(voidDialog).toBeHidden();
    // The entry leaves the page, its actions with it: focus goes to Add entry.
    await expect(page.getByRole("button", { name: "Add entry" })).toBeFocused();
    await expect(rabiesLine(page)).toHaveText(rabiesBefore);
    await expect(entryCard(page, "Rabies 1-year", correctedLot)).toHaveCount(0);

    await page.goto(`/dashboard/animals/${id}/medical/history`);
    const voided = entryCard(page, "Rabies 1-year", correctedLot);
    await expect(voided).toContainText("Voided by Olivia Chen");
    await expect(voided).toContainText("Entered against the wrong animal.");
    await expect(voided.getByText("Rabies 1-year", { exact: true })).toHaveClass(
      /line-through/,
    );
    await expect(
      voided.getByRole("button", { name: /^Actions for/ }),
    ).toHaveCount(0);

    // The animal's activity, newest first.
    await page.goto(`/dashboard/animals/${id}`);
    const feed = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "most recent activity logs for this animal" })
      .locator("li")
      .filter({ hasText: /\S/ });
    await expect(feed.nth(0)).toContainText("voided a medical entry");
    await expect(feed.nth(1)).toContainText("edited a medical entry");
    await expect(feed.nth(2)).toContainText("recorded a medical entry");
  });
});

test.describe("as a volunteer", () => {
  test.use({ storageState: volunteerStatePath });

  test("reads every Medical page, with no controls to change anything", async ({
    page,
  }) => {
    const id = await animalId(page, "Frisco");

    await page.goto(`/dashboard/animals/${id}/medical`);
    await expect(rabiesLine(page)).toHaveText(/^Valid until/);
    await expect(entryCard(page, "DHPP", "DH-2291B")).toBeVisible();

    for (const section of ["", "/history", "/vaccines-tests"]) {
      await page.goto(`/dashboard/animals/${id}/medical${section}`);
      await expect(entryCard(page, "Heartworm antigen", "Negative")).toBeVisible();
      await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /^Actions for/ }),
      ).toHaveCount(0);
    }
  });
});

/**
 * Retires or unretires the seeded "Heartworm antigen" on Settings → Medical.
 * Finding it already as wanted is fine: a retry, or the cleanup after a test
 * that never got as far as retiring it.
 */
const setHeartwormRetired = async (page: Page, retire: boolean) => {
  await page.goto("/dashboard/settings/medical");
  const itemActions = page.getByRole("button", {
    name: "Actions for Heartworm antigen",
  });
  await expect(itemActions).toBeVisible();
  await expect(async () => {
    if (!(await page.getByRole("menuitem").first().isVisible())) {
      await itemActions.click();
    }
    await expect(page.getByRole("menuitem").first()).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  const item = page.getByRole("menuitem", {
    name: retire ? "Retire" : "Unretire",
    exact: true,
  });
  if (await item.isVisible()) {
    await item.click();
    await expect(
      page.getByText(retire ? "Item retired." : "Item unretired."),
    ).toBeVisible();
  } else {
    await page.keyboard.press("Escape");
  }
};

test.describe("as an admin", () => {
  test.use({ storageState: adminStatePath });

  // In a hook rather than a `finally`, so the seed's catalog is put back
  // even when the test fails or times out partway through retiring, with
  // the hook's own time to do it in.
  test.afterEach(async ({ page }) => {
    await setHeartwormRetired(page, false);
  });

  test("a retired catalog item leaves the staff's picker, and its entries keep it", async ({
    page,
    browser,
  }) => {
    await setHeartwormRetired(page, true);

    const staff = await browser.newContext({ storageState: staffStatePath });
    const staffPage = await staff.newPage();
    const id = await animalId(staffPage, "Frisco");

    await staffPage.goto(`/dashboard/animals/${id}/medical/vaccines-tests`);
    // An entry already recorded keeps its item's name.
    await expect(
      entryCard(staffPage, "Heartworm antigen", "Negative"),
    ).toBeVisible();

    await pickFromMenu(
      staffPage,
      staffPage.getByRole("button", { name: "Add entry" }),
      "Test",
    );
    const dialog = staffPage.getByRole("dialog", { name: "Record a test" });
    await dialog.getByRole("combobox", { name: /^Test/ }).click();
    await expect(
      staffPage.getByRole("option", { name: "Parvovirus antigen" }),
    ).toBeVisible();
    await expect(
      staffPage.getByRole("option", { name: "Heartworm antigen" }),
    ).toHaveCount(0);
    await staff.close();
  });

  test("a test with an analyte listed twice says so instead of not saving", async ({
    page,
  }) => {
    await page.goto("/dashboard/settings/medical");
    const addItem = page.getByRole("button", { name: "Add Item" });
    const dialog = page.getByRole("dialog", { name: "Add Item" });
    // The trigger can swallow the first click before hydration settles.
    await expect(async () => {
      if (!(await dialog.isVisible())) await addItem.click();
      await expect(dialog).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    await dialog.getByRole("combobox", { name: /^Kind/ }).click();
    await page.getByRole("option", { name: "Test", exact: true }).click();
    await dialog.getByLabel(/^Name/).fill("Twice-listed test");
    await dialog.getByLabel("Analyte 1", { exact: true }).fill("FeLV antigen");
    await dialog.getByRole("button", { name: "Add analyte" }).click();
    await dialog.getByLabel("Analyte 2", { exact: true }).fill("felv antigen");
    await dialog.getByRole("button", { name: "Create Item" }).click();

    await expect(
      dialog.getByText('The analyte "felv antigen" is listed twice.'),
    ).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});
