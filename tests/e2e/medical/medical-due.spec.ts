import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";
import { firstRowIdByQuery } from "../support/note-audit";

// What the due list shows and leaves out, and how it groups, is covered by
// the database tests (prisma/medical-due.test.ts) and the grouping's unit
// tests. This is what only a browser can show: that the sidebar reaches the
// page, that a seeded overdue booster sits where its animal is, and that
// care due today can be recorded from the list.

const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

// The browser runs in the shelter's zone, so the calendar's today, which
// bounds the due-date picker, is the shelter's today.
test.use({ timezoneId: SHELTER_ZONE });

const staffStatePath = storageStatePathFor("medical-due-staff.state.json");

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "staff1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: staffStatePath,
  });
});

test.use({ storageState: staffStatePath });

// Days are `yyyy-MM-dd` keys, as the app stores them. The helpers below are
// the ones in tests/e2e/animals/medical-scheduling.spec.ts.
type DayKey = string;

/** Today in `zone`. "en-CA" formats dates in the `yyyy-MM-dd` shape. */
const todayIn = (zone: string): DayKey =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

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

/** A group's section ("Overdue", "Today", "Upcoming") under a location or
 * foster's heading. */
const section = (page: Page, group: string, bucket: string) =>
  page
    .getByRole("region", { name: group, exact: true })
    .getByRole("region", { name: bucket, exact: true });

/** The rows of one animal's care with one item in a section. */
const rowsOf = (sectionLocator: Locator, animal: string, item: string) =>
  sectionLocator
    .getByRole("listitem")
    .filter({ has: sectionLocator.page().getByRole("link", { name: animal, exact: true }) })
    .filter({ hasText: item });

test("Fido's overdue booster is under his location, and care due today is recorded from the list", async ({
  page,
}) => {
  const today = todayIn(SHELTER_ZONE);

  // The sidebar's Medical entry opens to Due.
  await page.goto("/dashboard");
  const due = page.getByRole("link", { name: "Due", exact: true });
  await expect(async () => {
    if (!(await due.isVisible())) {
      await page.getByRole("button", { name: "Medical", exact: true }).click();
    }
    await expect(due).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await due.click();
  await page.waitForURL("**/dashboard/medical/due");
  await expect(
    page.getByRole("heading", { level: 1, name: "Medical Care Due" }),
  ).toBeVisible();

  // The seed scheduled Fido's DHPP booster to be due three days ago. He is in
  // the Medical wing's MED-1. Only read here: other specs expect it overdue.
  const fido = rowsOf(section(page, "Medical wing", "Overdue"), "Fido", "DHPP");
  await expect(fido).toHaveCount(1);
  await expect(fido).toContainText("MED-1");
  await expect(fido).toContainText("days overdue");

  // Fern, a rabbit in Isolation, gets a Praziquantel due today. A retry runs
  // against the database an earlier attempt wrote to, which may have left one
  // scheduled, so the rows are counted rather than assumed.
  const fernToday = rowsOf(section(page, "Isolation", "Today"), "Fern", "Praziquantel");
  const before = await fernToday.count();

  const fernId = await firstRowIdByQuery(page, "/dashboard/animals", "Fern");
  await page.goto(`/dashboard/animals/${fernId}/medical`);
  await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), /Schedule/);
  const schedule = page.getByRole("dialog", { name: "Schedule care" });
  await chooseOption(page, schedule.getByRole("combobox", { name: /^Kind/ }), "Treatment");
  await chooseOption(page, schedule.getByRole("combobox", { name: /^Item/ }), /^Praziquantel/);
  await pickDay(page, schedule.getByRole("button", { name: /^Due date \*:/ }), today);
  await schedule.getByRole("button", { name: "Schedule" }).click();
  await expect(schedule).toBeHidden();

  await page.goto("/dashboard/medical/due");
  await expect(fernToday).toHaveCount(before + 1);
  const row = fernToday.first();
  await expect(row).toContainText("ISO-2");
  await expect(row).toContainText("Due today");

  // Record it as given from the list. The form reads Fern's options as it
  // opens; Praziquantel doesn't repeat, so nothing else is scheduled.
  await row
    .getByRole("button", { name: /^Record Praziquantel \(Due .*\) for Fern as given$/ })
    .click();
  const record = page.getByRole("dialog", { name: "Record Praziquantel for Fern as given" });
  await expect(record.getByRole("combobox", { name: /^Treatment/ })).toHaveText("Praziquantel");
  await expect(record.getByRole("checkbox", { name: "Schedule the next one" })).toHaveCount(0);
  await record.getByRole("button", { name: "Record Treatment" }).click();
  await expect(record).toBeHidden();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "Entry recorded." }),
  ).toBeVisible();

  // It leaves the list, its buttons with it: focus goes to the page heading.
  await expect(fernToday).toHaveCount(before);
  await expect(
    page.getByRole("heading", { level: 1, name: "Medical Care Due" }),
  ).toBeFocused();

  // Fern's own page has it as given today, as it was due.
  await page.goto(`/dashboard/animals/${fernId}/medical`);
  const recent = page.getByRole("region", { name: "Recent entries" });
  await expect(
    recent.locator("li[aria-label]").filter({ hasText: "Praziquantel" }).first(),
  ).toContainText(`due ${printedDay(today)}`);
});

test("the record form opens at once and holds the list until its options arrive", async ({
  page,
}) => {
  // `kind` given twice, as a hand-edited link might: both kinds count.
  await page.goto("/dashboard/medical/due?kind=VACCINE&kind=TREATMENT");
  const misty = rowsOf(section(page, "Cat room", "Today"), "Misty", "FVRCP");
  await expect(misty).toHaveCount(1);
  const otherRecord = page.getByRole("button", {
    name: /^Record Rabies 1-year .* for Whiskers as given$/,
  });
  await expect(otherRecord).toBeVisible();

  // Hold back the server action that reads the form's options, so the
  // dialog is seen while it waits.
  let letThrough!: () => void;
  const held = new Promise<void>((resolve) => (letThrough = resolve));
  await page.route("**/dashboard/medical/due**", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });

  const record = misty.getByRole("button", { name: /^Record FVRCP .* for Misty as given$/ });
  await record.click();
  const dialog = page.getByRole("dialog", { name: "Record FVRCP for Misty as given" });
  await expect(dialog.getByRole("status")).toHaveText("Loading the form…");
  // The open dialog hides the rest of the page, so no other row's form can
  // be opened over it.
  await expect(otherRecord).toHaveCount(0);

  letThrough();
  await expect(dialog.getByRole("combobox", { name: /^Vaccine/ })).toHaveText("FVRCP");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.unroute("**/dashboard/medical/due**");

  // Nothing typed, so it closes without asking, and focus goes back.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(record).toBeFocused();
});
