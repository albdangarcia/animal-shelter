import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";
import { firstRowIdByQuery } from "../support/note-audit";

// Every rule for exams is covered by the database tests
// (prisma/medical-exams.test.ts, and readiness's in the same file). These are
// the journeys only a browser can show: that the exam form on the animal's
// Medical tab reaches those rules, that readiness reads what it records, and
// who sees which controls.

test.describe.configure({ mode: "serial" });

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today, which bounds the pickers,
// is the shelter's today rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ timezoneId: SHELTER_ZONE });

const staffStatePath = storageStatePathFor("medical-exams-staff.state.json");
const volunteerStatePath = storageStatePathFor(
  "medical-exams-volunteer.state.json",
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

/** The id of the animal named exactly `name`, where the search also finds
 *  others whose names contain it ("Leo" finds Cleo). */
const animalIdNamed = async (page: Page, name: string) => {
  await page.goto(`/dashboard/animals?query=${encodeURIComponent(name)}`);
  const link = page
    .locator("tbody tr")
    .getByRole("link", { name, exact: true })
    .first();
  const href = await link.getAttribute("href");
  if (!href) throw new Error(`No animal named ${name}.`);
  return href.split("/").pop() as string;
};

// Days are handled as `yyyy-MM-dd` keys, as the app stores them, so no
// comparison depends on the runner's zone or clock time. The test reads
// today once, at its start, and picks that day in the day given rather than
// keeping the form's default: a form defaults to the server's today when it
// opens, which is the next day if the test runs across the shelter's
// midnight. The helpers below
// are the ones in medical-surgery-microchip.spec.ts.
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

/** The readiness panel on the animal's Activity tab. */
const readinessPanel = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({ hasText: "still outstanding before this animal is fully ready" });

/** Picks one answer in a radio group named by its label. */
const pickRadio = async (scope: Locator, group: RegExp | string, answer: string) =>
  scope
    .getByRole("radiogroup", { name: group })
    .getByRole("radio", { name: answer, exact: true })
    .click();

test.describe("as staff", () => {
  test.use({ storageState: staffStatePath });

  test("an intake exam asking for a vet's review, cleared by a recheck recorded from the due list", async ({
    page,
  }, testInfo) => {
    const today = todayIn(SHELTER_ZONE);
    // A retry or a repeat runs against the database an earlier attempt wrote
    // to, so each attempt marks the notes of what it writes. Daisy is a
    // hand-authored dog with no exam on record, whose medical record, feed
    // and readiness no other spec reads.
    const attempt = `${testInfo.retry}-${testInfo.repeatEachIndex}`;
    const marker = "Exam journey";
    const id = await animalId(page, "Daisy");
    const activity = `/dashboard/animals/${id}`;
    const overview = `${activity}/medical`;

    // Start by voiding what an earlier attempt left, so readiness reads as
    // the seed left it: no intake exam.
    const history = `${overview}/history?kind=EXAM`;
    // The page streams in: count only once its kind filter, which the
    // loading skeleton doesn't have, is there.
    const historyLoaded = () =>
      expect(page.getByRole("button", { name: /^Kind/ })).toBeVisible();
    await page.goto(history);
    const left = page
      .locator("li[aria-label]")
      .filter({ hasText: marker })
      .filter({ has: page.getByRole("button", { name: /^Actions for / }) });
    await historyLoaded();
    while ((await left.count()) > 0) {
      await voidEntry(page, left.first(), "Left by an earlier attempt of this test.");
      await page.goto(history);
      await historyLoaded();
    }

    await page.goto(activity);
    const panel = readinessPanel(page);
    await expect(panel).toContainText("No intake exam");
    await expect(panel.getByRole("link", { name: "Record intake exam" })).toHaveAttribute(
      "href",
      overview,
    );
    await expect(panel).not.toContainText("needs vet review");

    // Record an intake exam in house today: a heart murmur that needs a
    // vet's review, and a weight.
    await page.goto(overview);
    const lastExam = statusLine(page, "Last exam");
    const weight = statusLine(page, "Current weight");
    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), "Exam");
    const examForm = page.getByRole("dialog", { name: "Record an exam" });
    await chooseOption(page, examForm.getByRole("combobox", { name: /^Exam type/ }), "Intake exam");
    await pickDay(page, examForm.getByRole("button", { name: /^Date given \*:/ }), today);
    await pickRadio(examForm, /^Overall result/, "Needs vet review");
    await pickRadio(examForm, "Heart", "Abnormal");
    await examForm
      .getByRole("textbox", { name: /^Heart note/ })
      .fill("Grade III/VI systolic murmur.");
    await examForm.getByLabel("Weight", { exact: true }).fill("21.37");
    await examForm
      .getByLabel("Notes", { exact: true })
      .fill(`${marker}: intake, attempt ${attempt}.`);
    await examForm.getByRole("button", { name: "Record Exam" }).click();
    await expect(examForm).toBeHidden();
    await expect(lastExam).toHaveText(`Intake exam, ${printedDay(today)}: needs vet review`);
    await expect(lastExam).toHaveClass(/text-destructive/);
    await expect(weight).toContainText("21.37");

    // Readiness reads it: the intake exam is there, and asks for a review.
    await page.goto(activity);
    await expect(panel).toContainText(
      `Intake exam of ${printedDay(today)} needs vet review`,
    );
    await expect(panel.getByRole("link", { name: "Review the exam" })).toHaveAttribute(
      "href",
      `${overview}/history?kind=EXAM`,
    );
    await expect(panel).not.toContainText("No intake exam");

    // Schedule a recheck for today, and record it from its Due row with no
    // concerns.
    await page.goto(overview);
    await pickFromMenu(page, page.getByRole("button", { name: "Add entry" }), /Schedule/);
    const schedule = page.getByRole("dialog", { name: "Schedule care" });
    await chooseOption(page, schedule.getByRole("combobox", { name: /^Kind/ }), "Exam");
    await chooseOption(page, schedule.getByRole("combobox", { name: /^Exam type/ }), "Recheck exam");
    await pickDay(page, schedule.getByRole("button", { name: /^Due date \*:/ }), today);
    await schedule
      .getByLabel("Notes")
      .fill(`${marker}: recheck, attempt ${attempt}.`);
    await schedule.getByRole("button", { name: "Schedule" }).click();
    await expect(schedule).toBeHidden();

    await page
      .getByRole("region", { name: "Due", exact: true })
      .locator("li[aria-label]")
      .filter({ hasText: `recheck, attempt ${attempt}` })
      .getByRole("button", { name: /^Record Recheck exam .* as given$/ })
      .click();
    const recheck = page.getByRole("dialog", { name: "Record Recheck exam as given" });
    await pickDay(page, recheck.getByRole("button", { name: /^Date given \*:/ }), today);
    await pickRadio(recheck, /^Overall result/, "No concerns");
    await recheck.getByRole("button", { name: "Record Exam" }).click();
    await expect(recheck).toBeHidden();
    await expect(lastExam).toHaveText(`Recheck exam, ${printedDay(today)}: no concerns`);

    // The later exam clears the review.
    await page.goto(activity);
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText("needs vet review");
    await expect(panel).not.toContainText("No intake exam");

    // History lists both exams.
    await page.goto(history);
    await historyLoaded();
    const journey = page
      .locator("li[aria-label]")
      .filter({ hasText: `attempt ${attempt}` });
    await expect(journey.filter({ hasText: "Recheck exam" })).toHaveCount(1);
    await expect(journey.filter({ hasText: "Intake exam" })).toHaveCount(1);
    await expect(journey.filter({ hasText: "Intake exam" })).toContainText(
      "Grade III/VI systolic murmur.",
    );

    // The animal's activity, newest first: the recheck, its scheduling, the
    // vitals, then the intake exam. Only the medical rows are read, as other
    // specs may write Daisy's assessments meanwhile.
    await page.goto(activity);
    const feed = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "most recent activity logs for this animal" })
      .locator("li")
      .filter({ hasText: /a medical entry|recorded vitals/ });
    await expect(feed.nth(0)).toContainText("recorded a medical entry");
    await expect(feed.nth(1)).toContainText("scheduled a medical entry");
    await expect(feed.nth(2)).toContainText("recorded vitals");
    await expect(feed.nth(3)).toContainText("recorded a medical entry");
  });
});

test.describe("as a volunteer", () => {
  test.use({ storageState: volunteerStatePath });

  test("reads an exam and its findings, with no controls to change anything", async ({
    page,
  }) => {
    // Leo's intake exam, the day after he arrived, found ear mites and
    // fractured teeth, and needs treatment.
    const id = await animalIdNamed(page, "Leo");
    await page.goto(`/dashboard/animals/${id}/medical`);
    await expect(statusLine(page, "Last exam")).toHaveText(
      /^Intake exam, .+: needs treatment$/,
    );

    const exam = page
      .getByRole("region", { name: "Recent entries" })
      .locator("li[aria-label]")
      .filter({ hasText: "Intake exam" });
    await expect(exam).toHaveCount(1);
    await expect(exam).toContainText("Needs treatment");
    await expect(exam).toContainText("Ears (abnormal): Ear mites.");
    await expect(exam).toContainText(
      "Mouth and teeth (abnormal): Multiple fractured teeth, gingival recession.",
    );

    await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);
    for (const name of [/^Record /, /^Reschedule /, /^Decline /, /^Actions for /]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
  });
});
