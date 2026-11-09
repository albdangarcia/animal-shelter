import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";
import { firstRowIdByQuery } from "../support/note-audit";

// Every rule for surgeries, microchips and spay/neuter exemptions is covered
// by the database tests (prisma/medical-surgery.test.ts,
// medical-microchip.test.ts and medical-spay-neuter.test.ts). These are the
// journeys only a browser can show: that the animal's Medical Overview
// reaches those rules and shows the status they give, and who sees which
// controls.

test.describe.configure({ mode: "serial" });

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today, which bounds the pickers,
// is the shelter's today rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ timezoneId: SHELTER_ZONE });

const staffStatePath = storageStatePathFor("medical-surgery-staff.state.json");
const volunteerStatePath = storageStatePathFor(
  "medical-surgery-volunteer.state.json",
);

test.beforeAll(async ({ browser }) => {
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
});

const animalId = (page: Page, name: string) =>
  firstRowIdByQuery(page, "/dashboard/animals", name);

// Days are handled as `yyyy-MM-dd` keys, as the app stores them, so no
// comparison depends on the runner's zone or clock time. The test reads
// today once, at its start, and picks that day in the day given rather than
// keeping the form's default: a form defaults to the server's today when it
// opens, which is the next day if the test runs across the shelter's
// midnight. The helpers below
// are the ones in medical-scheduling.spec.ts.
type DayKey = string;

/** Today in `zone`. "en-CA" formats dates in the `yyyy-MM-dd` shape. */
const todayIn = (zone: string): DayKey =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

const shiftDay = (day: DayKey, days: number): DayKey =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

// The app prints a day as "Feb 1, 2026". Read at midnight UTC, so the key
// cannot slip a day.
const printedDay = (day: DayKey) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// data-day is the browser's en-US short date: M/D/YYYY, no padding.
const dataDayOf = (day: DayKey) => {
  const [year, month, date] = day.split("-").map(Number);
  return `${month}/${date}/${year}`;
};

const monthOf = (dataDay: string) => {
  const [month, , year] = dataDay.split("/").map(Number);
  return year * 12 + month;
};

const calendarOf = (page: Page) =>
  page.getByRole("dialog").filter({ has: page.locator("button[data-day]") });

/**
 * Picks `day` in the day picker `trigger` opens, stepping to the day's month
 * if the calendar opens on another. The calendar stays open after a pick, so
 * Escape closes it.
 */
const pickDay = async (page: Page, trigger: Locator, day: DayKey) => {
  const calendar = calendarOf(page);
  await expect(async () => {
    if (!(await calendar.isVisible())) await trigger.click();
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const cell = calendar.locator(`button[data-day="${dataDayOf(day)}"]`);
  for (let step = 0; !(await cell.isVisible()); step++) {
    if (step > 24) {
      throw new Error(`The calendar never reached ${printedDay(day)}.`);
    }
    const shown = await calendar
      .locator("button[data-day]")
      .nth(15)
      .getAttribute("data-day");
    const back = monthOf(dataDayOf(day)) < monthOf(shown ?? "");
    await calendar
      .getByRole("button", {
        name: back ? "Go to the Previous Month" : "Go to the Next Month",
      })
      .click();
  }
  await cell.click();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();
};

/**
 * Opens a Radix menu and picks an item. The trigger can swallow the first
 * click before hydration settles, so retry, re-clicking only while the menu
 * is closed.
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

const chooseOption = async (page: Page, combobox: Locator, option: RegExp | string) => {
  await combobox.click();
  await page.getByRole("option", { name: option }).click();
};

/** One line of the Overview's "Medical status" list. */
const statusLine = (page: Page, label: string) =>
  page
    .locator('dl[aria-label="Medical status"] div')
    .filter({ has: page.locator("dt", { hasText: label }) })
    .locator("dd");

/** Voids an entry from its row's menu. */
const voidEntry = async (page: Page, row: Locator, reason: string) => {
  await pickFromMenu(page, row.getByRole("button", { name: /^Actions for / }), /Void/);
  const voidDialog = page.getByRole("alertdialog");
  await voidDialog.getByLabel("Reason for voiding").fill(reason);
  await voidDialog.getByRole("button", { name: "Void Entry" }).click();
  await expect(voidDialog).toBeHidden();
};

test.describe("as staff", () => {
  test.use({ storageState: staffStatePath });

  test("a chip, a spay scheduled then declined as an exemption, and a spay given then voided", async ({
    page, browser,
  }, testInfo) => {
    const today = todayIn(SHELTER_ZONE);
    const reviewDay = shiftDay(today, 30);
    // A retry or a repeat runs against the database an earlier attempt wrote
    // to, so each attempt marks what it writes: its notes, and a chip number
    // of its own. Juniper is a young female in foster that no other spec
    // reads medically, and her record has no spay.
    const attempt = `${testInfo.retry}-${testInfo.repeatEachIndex}`;
    const marker = "Surgery journey";
    const chipPrefix = "9779000000000";
    const chipNumber = `${chipPrefix}${testInfo.retry}${testInfo.repeatEachIndex}`;
    const id = await animalId(page, "Juniper");
    const overview = `/dashboard/animals/${id}/medical`;

    // Start by voiding what an earlier attempt left: its chip, and its spay
    // or exemption, so the status reads as the seed left it.
    const history = `${overview}/history?kind=SURGERY,MICROCHIP`;
    // The page streams in: count only once its kind filter, which the
    // loading skeleton doesn't have, is there.
    const historyLoaded = () =>
      expect(page.getByRole("button", { name: /^Kind/ })).toBeVisible();
    await page.goto(history);
    const left = page
      .locator("li[aria-label]")
      .filter({ hasText: new RegExp(`${marker}|${chipPrefix}`) })
      .filter({ has: page.getByRole("button", { name: /^Actions for / }) });
    await historyLoaded();
    while ((await left.count()) > 0) {
      await voidEntry(page, left.first(), "Left by an earlier attempt of this test.");
      await page.goto(history);
      await historyLoaded();
    }

    // The Overview reads the status the records give.
    await page.goto(overview);
    const spayNeuter = statusLine(page, "Spay/neuter");
    const microchip = statusLine(page, "Microchip");
    await expect(spayNeuter).toHaveText("Not on record");
    await expect(microchip).not.toContainText(chipNumber);

    // Record a microchip implanted in house today.
    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), "Microchip");
    const chipForm = page.getByRole("dialog", { name: "Record a microchip" });
    await chipForm.getByLabel(/^Chip number/).fill(chipNumber);
    await chooseOption(page, chipForm.getByRole("combobox", { name: "Registration status" }), /^Registered$/);
    await chipForm.getByRole("button", { name: "Record Microchip" }).click();
    await expect(chipForm.getByText("A registered chip needs its registry name.")).toBeVisible();
    await expect(chipForm.getByLabel("Registry name")).toBeFocused();
    await chipForm.getByLabel("Registry name").fill("Journey Registry");
    await pickDay(page, chipForm.getByRole("button", { name: /^Registration date:/ }), today);
    const registrationDateLabel = await chipForm.getByRole("button", { name: /^Registration date:/ }).getAttribute("aria-label");
    await chipForm.getByLabel("Registration notes (staff only)").fill("Journey private registration note");
    await chipForm.getByRole("button", { name: "Record Microchip" }).click();
    await expect(chipForm).toBeHidden();
    await expect(microchip).toContainText(chipNumber);
    await expect(microchip).toContainText("Registration: Registered · Journey Registry");

    const chipRow = page.locator("li[aria-label]").filter({ hasText: chipNumber });
    await pickFromMenu(page, chipRow.getByRole("button", { name: /^Actions for/ }), "Edit");
    const editChip = page.getByRole("dialog", { name: "Edit microchip" });
    await expect(editChip.getByLabel("Registry name")).toHaveValue("Journey Registry");
    await expect(editChip.getByRole("button", { name: /^Registration date:/ })).toHaveAttribute("aria-label", registrationDateLabel!);
    await editChip.getByLabel("Brand", { exact: true }).fill("Journey Brand");
    await editChip.getByRole("button", { name: "Save Changes" }).click();
    await expect(editChip).toBeHidden();
    await expect(chipRow).toContainText("Journey private registration note");
    const reader = await browser.newContext({ storageState: volunteerStatePath, timezoneId: "Pacific/Kiritimati" });
    try {
      const readerPage = await reader.newPage();
      await readerPage.goto(overview);
      await expect(statusLine(readerPage, "Microchip")).toContainText("Journey Registry");
      await expect(statusLine(readerPage, "Microchip")).toContainText(printedDay(today));
      const readChip = readerPage.locator("li[aria-label]").filter({ hasText: chipNumber });
      await expect(readChip).toContainText("Registration: Registered");
      await expect(readChip.getByRole("button", { name: /^Actions for/ })).toHaveCount(0);
    } finally { await reader.close(); }
    await pickFromMenu(page, chipRow.getByRole("button", { name: /^Actions for/ }), "Edit");
    await editChip.getByLabel(/^Chip number/).fill(chipNumber.split("").join("-"));
    await expect(editChip.getByLabel("Registry name")).toHaveValue("Journey Registry");
    const replacementNumber = `${chipPrefix}9${testInfo.retry}`;
    await editChip.getByLabel(/^Chip number/).fill(replacementNumber);
    await expect(editChip.getByText(/The chip number changed/)).toBeVisible();
    await expect(editChip.getByRole("combobox", { name: "Registration status" })).toHaveText("Unknown");
    await expect(editChip.getByLabel("Registry name")).toHaveCount(0);
    await expect(editChip.getByLabel("Registration notes (staff only)")).toHaveValue("");
    await chooseOption(page, editChip.getByRole("combobox", { name: "Registration status" }), /^Registered$/);
    await editChip.getByRole("button", { name: "Save Changes" }).click();
    await expect(editChip.getByText("A registered chip needs its registry name.")).toBeVisible();
    await expect(editChip.getByLabel("Registry name")).toBeFocused();
    await expect(editChip.getByLabel(/^Chip number/)).toHaveValue(replacementNumber);
    await editChip.getByLabel("Registry name").fill("Replacement Registry for Companion Animals and National Recovery Services");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("chip-registration-form-390.png"), fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("chip-registration-form-1280.png"), fullPage: true, animations: "disabled" });
    await editChip.getByRole("button", { name: "Save Changes" }).click();
    await expect(editChip).toBeHidden();
    const replacedChip = page.locator("li[aria-label]").filter({ hasText: replacementNumber });
    await replacedChip.getByRole("button", { name: "Show 2 changes" }).click();
    await expect(replacedChip.getByRole("list", { name: "Change history" })).toContainText(`Chip number: ${chipNumber} → ${replacementNumber}`);
    await expect(replacedChip).toContainText("Registry: Journey Registry → Replacement Registry");
    await expect(replacedChip).toContainText("Registration date: Unknown");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("chip-registration-390.png"), fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("chip-registration-1280.png"), fullPage: true, animations: "disabled" });

    // The same number again is refused, under the field.
    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), "Microchip");
    await chipForm.getByLabel(/^Chip number/).fill(replacementNumber);
    await chipForm.getByRole("button", { name: "Record Microchip" }).click();
    await expect(
      chipForm.getByText("That chip number is already on this animal's record."),
    ).toBeVisible();
    const discardChip = page.getByRole("alertdialog", { name: "Discard unsaved entry?" });
    await expect(async () => {
      if (!(await discardChip.isVisible())) await chipForm.getByRole("button", { name: "Cancel" }).click();
      await expect(discardChip).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await discardChip.getByRole("button", { name: "Discard" }).click();
    await expect(chipForm).toBeHidden();

    // Schedule a spay, then decline it as an exemption with a review day.
    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), /Schedule/);
    const schedule = page.getByRole("dialog", { name: "Schedule care" });
    await chooseOption(page, schedule.getByRole("combobox", { name: /^Kind/ }), "Surgery");
    await chooseOption(page, schedule.getByRole("combobox", { name: /^Procedure/ }), "Spay");
    await pickDay(page, schedule.getByRole("button", { name: /^Due date \*:/ }), shiftDay(today, 2));
    await schedule.getByLabel("Notes").fill(`${marker}: spay planned, attempt ${attempt}.`);
    await schedule.getByRole("button", { name: "Schedule" }).click();
    await expect(schedule).toBeHidden();

    const due = page.getByRole("region", { name: "Due", exact: true });
    await due
      .locator("li[aria-label]")
      .filter({ hasText: `spay planned, attempt ${attempt}` })
      .getByRole("button", { name: /^Decline Spay \(Due / })
      .click();
    const decline = page.getByRole("dialog", { name: /^Decline Spay \(Due / });
    await decline
      .getByRole("radiogroup", { name: /^Reason for the exemption/ })
      .getByRole("radio", { name: "Too young or underweight" })
      .click();
    await pickDay(page, decline.getByRole("button", { name: /^Review date/ }), reviewDay);
    await decline.getByRole("button", { name: "Decline Entry" }).click();
    await expect(decline).toBeHidden();
    const exempt = `Exempt until ${printedDay(reviewDay)}: too young or underweight`;
    await expect(spayNeuter).toHaveText(exempt);

    // Record a spay as given, ad hoc: the animal is altered.
    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), "Surgery");
    const surgery = page.getByRole("dialog", { name: "Record a surgery" });
    await chooseOption(page, surgery.getByRole("combobox", { name: /^Procedure/ }), "Spay");
    await pickDay(page, surgery.getByRole("button", { name: /^Date given \*:/ }), today);
    await surgery.getByLabel("Notes", { exact: true }).fill(`${marker}: spay given, attempt ${attempt}.`);
    await surgery.getByRole("button", { name: "Record Surgery" }).click();
    await expect(surgery).toBeHidden();
    await expect(spayNeuter).toHaveText(`Altered (spay, ${printedDay(today)})`);

    // Altered now, so neither form offers another spay or neuter: each says
    // which entry holds the place and links to her surgeries. Other surgery
    // is still on offer. Closing either writes nothing.
    const held = `Already spayed on its record (${printedDay(today)}), so spay and neuter aren't offered.`;
    const surgeries = `${overview}/history?kind=SURGERY`;
    const offersNoSpay = async (form: Locator) => {
      await form.getByRole("combobox", { name: /^Procedure/ }).click();
      await expect(page.getByRole("option", { name: "Other" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Spay", exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("option", { name: "Other" })).toBeHidden();
    };
    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), "Surgery");
    await offersNoSpay(surgery);
    await expect(surgery.getByText(held)).toBeVisible();
    await expect(
      surgery.getByRole("link", { name: "See its surgeries" }),
    ).toHaveAttribute("href", surgeries);
    await surgery.getByRole("button", { name: "Cancel" }).click();
    await expect(surgery).toBeHidden();

    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), /Schedule/);
    await chooseOption(page, schedule.getByRole("combobox", { name: /^Kind/ }), "Surgery");
    await offersNoSpay(schedule);
    await expect(schedule.getByText(held)).toBeVisible();
    const discardSchedule = page.getByRole("alertdialog", { name: "Discard unsaved entry?" });
    await expect(async () => {
      if (!(await discardSchedule.isVisible())) await schedule.getByRole("button", { name: "Cancel" }).click();
      await expect(discardSchedule).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await discardSchedule.getByRole("button", { name: "Discard" }).click();
    await expect(schedule).toBeHidden();

    // Void it: the exemption holds again.
    const given = page
      .getByRole("region", { name: "Recent entries" })
      .locator("li[aria-label]")
      .filter({ hasText: `spay given, attempt ${attempt}` });
    await voidEntry(page, given, "Recorded on the wrong animal.");
    await expect(spayNeuter).toHaveText(exempt);

    // The animal's activity, newest first. The refused chip wrote nothing.
    await page.goto(`/dashboard/animals/${id}`);
    const feed = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "most recent activity logs for this animal" })
      .locator("li")
      .filter({ hasText: /\S/ });
    await expect(feed.nth(0)).toContainText("voided a medical entry");
    await expect(feed.nth(1)).toContainText("recorded a medical entry");
    await expect(feed.nth(2)).toContainText("declined a medical entry");
    await expect(feed.nth(3)).toContainText("scheduled a medical entry");
    await expect(feed.nth(4)).toContainText("edited a medical entry");
    await expect(feed.nth(5)).toContainText("edited a medical entry");
    await expect(feed.nth(6)).toContainText("recorded a medical entry");
  });
});

test.describe("as a volunteer", () => {
  test.use({ storageState: volunteerStatePath });

  test("reads an exemption and a chip, with no controls to change anything", async ({
    page,
  }) => {
    // Godzilla, an iguana, is exempt for good: not routinely done for his
    // species. His chip was found on a scan before intake.
    const id = await animalId(page, "Godzilla");
    await page.goto(`/dashboard/animals/${id}/medical`);
    await expect(statusLine(page, "Spay/neuter")).toHaveText("Exempt: other");
    await expect(statusLine(page, "Microchip")).toContainText("985141000100006");
    // The card above the tabs reads the same record, and links each fact to
    // the Medical tab, which a volunteer can read.
    for (const name of [
      "Exempt (medical record)",
      "985141000100006 (medical record)",
    ]) {
      await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute(
        "href",
        `/dashboard/animals/${id}/medical`,
      );
    }

    await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);
    for (const name of [
      /^Record /,
      /^Reschedule /,
      /^Decline /,
      /^Schedule spay\/neuter/,
      /^Record a new exemption/,
      /^Actions for /,
    ]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }

    // History shows the exemption, also without controls.
    await page.goto(`/dashboard/animals/${id}/medical/history?kind=SURGERY`);
    const exemption = page.locator("li[aria-label]").filter({ hasText: "Neuter" });
    await expect(exemption).toContainText("Exempt");
    await expect(exemption).toContainText("No review date");
    await expect(exemption.getByRole("button", { name: /^Actions for / })).toHaveCount(0);

    // The seed's lapsed exemption is up for review. The volunteer sees it on
    // the due list and on the animal's Overview, without its two actions.
    // Its animal shares its name with others, so the row is found by what
    // it is.
    await page.goto("/dashboard/medical/due");
    const review = page
      .getByRole("region", { name: "Overdue", exact: true })
      .getByRole("listitem")
      .filter({ hasText: "Spay/neuter exemption review" });
    await expect(review).toHaveCount(1);
    await expect(review).toContainText("Exempt from spay: too young or underweight");
    const reviewActions = /^(Schedule spay\/neuter|Record a new exemption)/;
    await expect(review.getByRole("button", { name: reviewActions })).toHaveCount(0);

    await review.getByRole("link").first().click();
    await page.waitForURL(/\/dashboard\/animals\/[^/]+\/medical$/);
    const due = page.getByRole("region", { name: "Due", exact: true });
    await expect(
      due.locator("li[aria-label]").filter({ hasText: "Exemption lapsed" }),
    ).toHaveCount(1);
    await expect(page.getByRole("button", { name: reviewActions })).toHaveCount(0);
  });
});
