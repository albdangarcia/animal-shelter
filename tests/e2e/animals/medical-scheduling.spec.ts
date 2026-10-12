import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  fillStable,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";
import { firstRowIdByQuery } from "../support/note-audit";

// Every rule of scheduling, rescheduling, declining and recording scheduled
// care is covered by the database tests (prisma/medical-scheduling.test.ts).
// These are the journeys only a browser can show: that the animal's Medical
// Overview reaches those rules, and who sees which controls.

test.describe.configure({ mode: "serial" });

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today, which bounds the pickers,
// is the shelter's today rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ timezoneId: SHELTER_ZONE });

const staffStatePath = storageStatePathFor("medical-scheduling-staff.state.json");
const volunteerStatePath = storageStatePathFor(
  "medical-scheduling-volunteer.state.json",
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
// comparison depends on the runner's zone or clock time.
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

// The calendar is a popover, a dialog of its own inside the form's dialog;
// it is the one holding day buttons.
const calendarOf = (page: Page) =>
  page.getByRole("dialog").filter({ has: page.locator("button[data-day]") });

/**
 * Picks `day` in the day picker `trigger` opens. react-day-picker stamps
 * every day button with data-day, the only unambiguous handle. The month shown
 * on opening is not always the one holding the day, so it steps towards the
 * day's month, reading the shown month off a cell from the middle of the
 * grid, which is never an outside day. The calendar stays open after a pick,
 * so Escape closes it before anything else is pressed.
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
 * The day a day picker shows, read from its name ("Next due date *: October
 * 25th, 2026").
 */
const shownDay = async (trigger: Locator): Promise<DayKey> => {
  const name = (await trigger.getAttribute("aria-label")) ?? "";
  const match = name.match(/: (\w+) (\d+)\w*, (\d{4})$/);
  if (!match) throw new Error(`No day in the date picker's name: "${name}".`);
  const [, monthName, date, year] = match;
  const month = new Date(`${monthName} 1, 2000`).getMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}-${date.padStart(2, "0")}`;
};

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

const chooseOption = async (page: Page, combobox: Locator, option: RegExp | string) => {
  await combobox.click();
  await page.getByRole("option", { name: option }).click();
};

const dueSection = (page: Page) => page.getByRole("region", { name: "Due" });

/** The due list's DHPP rows. */
const dueDhpp = (page: Page) =>
  dueSection(page).locator("li[aria-label]").filter({ hasText: "DHPP" });

test.describe("as staff", () => {
  test.use({ storageState: staffStatePath });

  test("scheduling a DHPP, rescheduling it, recording it with the next one, and declining that", async ({
    page,
  }, testInfo) => {
    const today = todayIn(SHELTER_ZONE);
    const inTwoDays = shiftDay(today, 2);
    // A retry runs against the database the failed attempt wrote to, so each
    // attempt marks its entry with its own note.
    const note = `Booster planned by the scheduling journey, attempt ${testInfo.retry}.`;
    const id = await animalId(page, "Rusty");
    await page.goto(`/dashboard/animals/${id}/medical`);

    // An earlier attempt may have left a DHPP scheduled. It would stop
    // recording from offering the next one, so void it first.
    while ((await dueDhpp(page).count()) > 0) {
      const left = dueDhpp(page).first();
      await pickFromMenu(
        page,
        left.getByRole("button", { name: /^Actions for DHPP/ }),
        /Void/,
      );
      const voidDialog = page.getByRole("alertdialog");
      await voidDialog
        .getByLabel("Reason for voiding")
        .fill("Left by an earlier attempt of this test.");
      await voidDialog.getByRole("button", { name: "Void Entry" }).click();
      await expect(voidDialog).toBeHidden();
    }

    // Schedule a DHPP for two days from now. It appears under Due.
    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), /Schedule/);
    const schedule = page.getByRole("dialog", { name: "Schedule care" });
    await chooseOption(page, schedule.getByRole("combobox", { name: /^Kind/ }), "Vaccine");
    await chooseOption(page, schedule.getByRole("combobox", { name: /^Item/ }), /^DHPP/);
    await pickDay(page, schedule.getByRole("button", { name: /^Due date \*:/ }), inTwoDays);
    await fillStable(schedule.getByLabel("Notes"), note);
    await schedule.getByRole("button", { name: "Schedule" }).click();
    await expect(schedule).toBeHidden();
    await expect(dueDhpp(page)).toHaveCount(1);
    const scheduled = dueDhpp(page).filter({ hasText: note });
    await expect(scheduled).toContainText(`Due ${printedDay(inTwoDays)}`);
    await expect(scheduled).toContainText("Scheduled by Olivia Chen");

    // Reschedule it to today: it is due today, and its history says so.
    await scheduled.getByRole("button", { name: /^Reschedule DHPP/ }).click();
    const reschedule = page.getByRole("dialog", { name: "Reschedule DHPP" });
    await pickDay(page, reschedule.getByRole("button", { name: /^Due date \*:/ }), today);
    await reschedule.getByRole("button", { name: "Reschedule" }).click();
    await expect(reschedule).toBeHidden();
    await expect(scheduled).toContainText("Due today");
    await scheduled.getByRole("button", { name: "Show 1 change" }).click();
    await expect(scheduled.getByRole("list", { name: "Change history" })).toContainText(
      `Due date: ${printedDay(inTwoDays)} → ${printedDay(today)}`,
    );

    // Record it as given, today, with the next one left ticked.
    await scheduled.getByRole("button", { name: /^Record DHPP .* as given$/ }).click();
    const record = page.getByRole("dialog", { name: "Record DHPP as given" });
    await expect(record.getByRole("combobox", { name: /^Vaccine/ })).toHaveText("DHPP");
    // Care scheduled during the stay wasn't given before it.
    await expect(record.getByRole("radio", { name: "Before intake" })).toHaveCount(0);
    await expect(record.getByLabel("Notes")).toHaveValue(note);
    await expect(
      record.getByRole("checkbox", { name: "Schedule the next one" }),
    ).toBeChecked();
    // The day prefilled is the day given plus the seeded DHPP's 14-day
    // interval, and it follows the day given.
    const givenTrigger = record.getByRole("button", { name: /^Date given \*:/ });
    const nextTrigger = record.getByRole("button", { name: /^Next due date \*:/ });
    expect(await shownDay(givenTrigger)).toBe(today);
    await expect(async () => {
      expect(await shownDay(nextTrigger)).toBe(shiftDay(today, 14));
    }).toPass();
    await pickDay(page, givenTrigger, shiftDay(today, -1));
    await expect(async () => {
      expect(await shownDay(nextTrigger)).toBe(shiftDay(today, 13));
    }).toPass();
    // A day picked by hand stays when the day given changes again.
    const nextDay = shiftDay(today, 20);
    await pickDay(page, nextTrigger, nextDay);
    await pickDay(page, givenTrigger, today);
    expect(await shownDay(nextTrigger)).toBe(nextDay);
    await record.getByRole("button", { name: "Record Vaccine" }).click();
    await expect(record).toBeHidden();
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: `Recorded. Next DHPP due ${printedDay(nextDay)}.` }),
    ).toBeVisible();
    // The row leaves Due, its buttons with it: focus goes to Add entry.
    await expect(page.getByRole("button", { name: "Add entry" })).toBeFocused();
    const recent = page.getByRole("region", { name: "Recent entries" });
    await expect(
      recent.locator("li[aria-label]").filter({ hasText: note }),
    ).toContainText(`due ${printedDay(today)}`);
    // The next one is the only DHPP under Due.
    await expect(dueDhpp(page)).toHaveCount(1);
    const next = dueDhpp(page).first();
    await expect(next).toContainText(`Due ${printedDay(nextDay)}`);

    // Decline the next one. It leaves Due and shows declined in History.
    const reason = `Moving to another protocol, attempt ${testInfo.retry}.`;
    await next.getByRole("button", { name: /^Decline DHPP/ }).click();
    const decline = page.getByRole("alertdialog");
    const declineButton = decline.getByRole("button", { name: "Decline Entry" });
    await expect(declineButton).toBeDisabled();
    await decline.getByLabel("Reason for declining").fill(reason);
    await declineButton.click();
    await expect(decline).toBeHidden();
    await expect(dueDhpp(page)).toHaveCount(0);

    await page.goto(`/dashboard/animals/${id}/medical/history`);
    const declined = page.locator("li[aria-label]").filter({ hasText: reason });
    await expect(declined).toContainText("Declined");
    await expect(declined).toContainText(`Due ${printedDay(nextDay)}`);

    // The animal's activity, newest first.
    await page.goto(`/dashboard/animals/${id}`);
    const feed = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "most recent activity logs for this animal" })
      .locator("li")
      .filter({ hasText: /\S/ });
    await expect(feed.nth(0)).toContainText("declined a medical entry");
    await expect(feed.nth(1)).toContainText("scheduled a medical entry");
    await expect(feed.nth(2)).toContainText("recorded a medical entry");
    await expect(feed.nth(3)).toContainText("rescheduled a medical entry");
    await expect(feed.nth(4)).toContainText("scheduled a medical entry");
  });
});

test.describe("as a volunteer", () => {
  test.use({ storageState: volunteerStatePath });

  test("sees what is due, with no controls to give, move or plan it", async ({
    page,
  }) => {
    const id = await animalId(page, "Fido");
    await page.goto(`/dashboard/animals/${id}/medical`);

    const booster = dueDhpp(page);
    await expect(booster).toHaveCount(1);
    await expect(booster).toContainText("Overdue");
    for (const name of [/^Record /, /^Reschedule /, /^Decline /, /^Actions for /]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);
  });
});
