import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  bootstrapStorageState,
  fillStable,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

const adminPassword = process.env.ADMIN_PASSWORD;

test.describe.configure({ mode: "serial" });

const storageStatePath = storageStatePathFor("intake-correction.state.json");
const volunteerStatePath = storageStatePathFor(
  "intake-correction-volunteer.state.json",
);

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the intake correction E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
  await bootstrapStorageState(browser, {
    email: "volunteer1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: volunteerStatePath,
  });
});

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today, which bounds the picker, is
// the shelter's today rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ storageState: storageStatePath, timezoneId: SHELTER_ZONE });

const INTAKES_PATH = "/dashboard/intakes";

// Every other spec and support file, read as text. An animal or person they
// name is one some spec relies on (a readiness fixture, an applicant whose
// history is asserted), and this spec rewrites intakes and names surrendering
// people, so it only touches animals and people no other spec mentions.
const E2E_DIR = path.resolve(__dirname, "..");
const OTHER_SOURCES = (fs.readdirSync(E2E_DIR, { recursive: true }) as string[])
  .filter(
    (file) =>
      file.endsWith(".ts") && path.basename(file) !== path.basename(__filename),
  )
  .map((file) => fs.readFileSync(path.join(E2E_DIR, file), "utf8"))
  .join("\n");
// A whole-word match, with any letter or digit in any script as a word
// character, so an accented name is matched too.
const isNamedElsewhere = (name: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`,
    "u",
  ).test(OTHER_SOURCES);

// Days are handled as `yyyy-MM-dd` keys, as the app stores them, so no
// comparison depends on the runner's zone or clock time.
type DayKey = string;

/** Today on the shelter's calendar. "en-CA" formats dates in that shape. */
const shelterToday = (): DayKey =>
  new Intl.DateTimeFormat("en-CA", { timeZone: SHELTER_ZONE }).format(
    new Date(),
  );

const shiftDay = (day: DayKey, days: number): DayKey =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

// The lists print a day as "Feb 1, 2026" (the shelter's format). Both
// directions read the day at midnight UTC, so the key cannot slip a day.
const printedDay = (day: DayKey) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const dayKeyOf = (printed: string): DayKey =>
  new Date(`${printed} UTC`).toISOString().slice(0, 10);

// The route's loading skeleton is a table too, so wait for the real footer
// before reading rows.
const gotoTable = async (page: Page, url: string) => {
  await page.goto(url);
  await expect(page.getByText(/of \d+ row\(s\) selected/)).toBeVisible();
};

interface IntakeRow {
  row: Locator;
  animalId: string;
  animalName: string;
}

// The columns, in order: select, intake date, animal, type, source, recorded
// by, actions.
const readIntakeRow = async (row: Locator): Promise<IntakeRow> => {
  const animalLink = row.getByRole("link").first();
  const href = await animalLink.getAttribute("href");
  if (!href) {
    throw new Error("An intake row has no animal link.");
  }
  return {
    row,
    animalId: href.split("/").pop() as string,
    animalName: (await animalLink.innerText()).trim(),
  };
};

// The first row of a list page whose animal no other spec names.
const firstUnnamedIntake = async (page: Page, url: string) => {
  await gotoTable(page, `${url}${url.includes("?") ? "&" : "?"}pageSize=50`);
  const rows = page.locator("tbody tr");
  for (let i = 0; i < (await rows.count()); i++) {
    const intake = await readIntakeRow(rows.nth(i));
    if (!isNamedElsewhere(intake.animalName)) return intake;
  }
  throw new Error(`No intake at ${url} belongs to an animal no other spec names.`);
};

// One animal's intakes, newest first (the list's default order). Names are not
// unique, so the rows are matched on the animal's link.
const latestIntakeOf = async (
  page: Page,
  animalId: string,
  animalName: string,
) => {
  await gotoTable(
    page,
    `${INTAKES_PATH}?query=${encodeURIComponent(animalName)}`,
  );
  const row = page
    .locator("tbody tr")
    .filter({ has: page.locator(`a[href="/dashboard/animals/${animalId}"]`) })
    .first();
  await expect(row).toBeVisible();
  return readIntakeRow(row);
};

// Clicking submit before hydration makes the browser submit the form itself (a
// GET that appends the fields to the URL) and nothing reaches the action. React
// marks each DOM node it has attached to, so wait for that on the form.
const waitForFormHydration = async (page: Page) => {
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Update Intake" }) });
  await expect(form).toBeVisible();
  await expect
    .poll(() =>
      form.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
};

// The edit link sits behind a Radix row menu, which sometimes drops the first
// click before hydration settles; re-clicking an open menu would shut it, so
// click again only while it is still closed. Returns the edit page's URL.
const openIntakeEdit = async (page: Page, row: Locator) => {
  const trigger = row.getByRole("button", { name: /open menu/i });
  const editItem = page.getByRole("menuitem", { name: "Edit…" });
  await expect(async () => {
    if (!(await editItem.isVisible())) {
      await trigger.click();
    }
    await expect(editItem).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await editItem.click();
  await page.waitForURL("**/dashboard/intakes/*/edit", { timeout: 60_000 });
  await waitForFormHydration(page);
  return page.url();
};

const gotoIntakeEdit = async (page: Page, editUrl: string) => {
  await page.goto(editUrl);
  await waitForFormHydration(page);
};

const submitCorrection = async (page: Page, expectedMessage: string) => {
  await page.getByRole("button", { name: "Update Intake" }).click();
  await expect(page.getByText(expectedMessage)).toBeVisible();
  await waitForPathname(page, INTAKES_PATH);
};

const correctionRows = (page: Page) =>
  page.locator("li").filter({ hasText: "corrected an intake" });

const gotoActivity = async (page: Page, animalId: string) => {
  await page.goto(`/dashboard/animals/${animalId}`);
  await expect(
    page.getByText("most recent activity logs for this animal").first(),
  ).toBeVisible();
};

// The feed is server-rendered; on a slow runner the first click can land
// before React attaches the toggle handler. Retry until the panel sticks open
// (the button text flips Show/Hide, so match either).
const latestCorrectionDetail = async (page: Page, animalId: string) => {
  await gotoActivity(page, animalId);
  const row = correctionRows(page).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Admin User");
  const detail = row.locator(".details-box");
  await expect(async () => {
    if (!(await detail.isVisible())) {
      await row.getByRole("button", { name: /details/i }).click();
    }
    await expect(detail).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  return detail;
};

const intakeDateTrigger = (page: Page) =>
  page.getByRole("button", { name: /^Intake Date \*:/ });

// The popover does not close on select, so it may already be open; clicking
// the trigger then would shut it.
const openIntakeCalendar = async (page: Page) => {
  const calendar = page.getByRole("dialog");
  await expect(async () => {
    if (!(await calendar.isVisible())) {
      await intakeDateTrigger(page).click();
    }
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return calendar;
};

// react-day-picker stamps every day button with data-day, the only
// unambiguous handle: the visible text is just the day number. The calendar
// opens on the current month, and every day picked here is in the past, so
// it steps back until the day is drawn.
const pickIntakeDay = async (page: Page, day: DayKey) => {
  const calendar = await openIntakeCalendar(page);
  // data-day is the browser's en-US short date: M/D/YYYY, no padding.
  const [year, month, date] = day.split("-").map(Number);
  const cell = calendar.locator(
    `button[data-day="${month}/${date}/${year}"]`,
  );
  for (let step = 0; !(await cell.isVisible()); step++) {
    if (step > 240) {
      throw new Error(`The intake calendar never reached ${printedDay(day)}.`);
    }
    await calendar
      .getByRole("button", { name: "Go to the Previous Month" })
      .click();
  }
  await cell.click();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();
};


// The picker's trigger is a combobox named by its field label, which differs
// by form, so it is found by the prompt it shows.
const personSearch = (page: Page) =>
  page.getByRole("combobox").filter({ hasText: "Search for a person..." });

// Picks the first person the search offers that no other spec names, and
// that is not `except`. Returns their name.
const choosePerson = async (page: Page, except?: string) => {
  await personSearch(page).click();
  await page.getByPlaceholder("Type a name, email, or phone...").fill("e");
  // Until the debounced search answers, the only option is "Add a new
  // person"; a person's option carries their name in a paragraph.
  const options = page.getByRole("option").filter({ has: page.locator("p") });
  await expect(options.first()).toBeVisible();
  for (const option of await options.all()) {
    const name = (await option.locator("p").first().innerText()).trim();
    if (name !== except && !isNamedElsewhere(name)) {
      await option.click();
      return name;
    }
  }
  throw new Error("No person in the picker is free of other specs.");
};

const chooseIntakeType = async (page: Page, label: string) => {
  await page.getByLabel("Intake Type *", { exact: true }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
};

// The edit page of the intake the notes correction edits, which the volunteer
// is then turned away from.
let notesEditUrl: string | undefined;

test("editing an intake's notes is shown in the feed, and saving it again untouched has nothing to save", async ({
  page,
}) => {
  const intake = await firstUnnamedIntake(
    page,
    `${INTAKES_PATH}?type=TRANSFER_IN`,
  );
  const editUrl = await openIntakeEdit(page, intake.row);
  notesEditUrl = editUrl;

  const notes = page.getByLabel("Internal Notes", { exact: true });
  const hadNotes = (await notes.inputValue()).trim() !== "";
  await fillStable(notes, `Corrected in E2E ${Date.now()}`);
  await submitCorrection(page, "Intake updated successfully.");

  const detail = await latestCorrectionDetail(page, intake.animalId);
  await expect(detail).toContainText(
    `Intake was corrected: notes were ${hadNotes ? "edited" : "added"}.`,
  );

  // The form sends back what it loaded, so the server sees no change.
  await gotoIntakeEdit(page, editUrl);
  await submitCorrection(page, "No changes to save.");
});

test("the person picker shows exactly the person a save will send", async ({
  page,
}) => {
  // An owner surrender whose animal and surrendering person no other spec
  // names, since both histories change.
  await gotoTable(page, `${INTAKES_PATH}?type=OWNER_SURRENDER&pageSize=50`);
  const rows = page.locator("tbody tr");
  let chosen: { intake: IntakeRow; recorded: string } | undefined;
  for (let i = 0; i < (await rows.count()); i++) {
    const intake = await readIntakeRow(rows.nth(i));
    const recorded = (
      await intake.row.locator("td").nth(4).locator(".truncate").innerText()
    ).trim();
    if (!isNamedElsewhere(intake.animalName) && !isNamedElsewhere(recorded)) {
      chosen = { intake, recorded };
      break;
    }
  }
  if (!chosen) {
    throw new Error("No owner surrender is free of other specs.");
  }
  const { intake, recorded } = chosen;
  await openIntakeEdit(page, intake.row);

  // The person on record is shown by name.
  await expect(page.getByText(recorded, { exact: true })).toBeVisible();

  // Cleared stays cleared: the form then has no person to send, so it
  // refuses, rather than quietly sending the recorded one back.
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(personSearch(page)).toBeVisible();
  await page.getByRole("button", { name: "Update Intake" }).click();
  await expect(page.getByText("A surrendering person is required.")).toBeVisible();
  await expect(personSearch(page)).toBeVisible();

  // A different person survives switching the type away and back.
  const replacement = await choosePerson(page, recorded);
  await chooseIntakeType(page, "Stray");
  await chooseIntakeType(page, "Owner Surrender");
  await expect(page.getByText(replacement, { exact: true })).toBeVisible();

  await submitCorrection(page, "Intake updated successfully.");
  const detail = await latestCorrectionDetail(page, intake.animalId);
  await expect(detail).toContainText(
    `Intake was corrected: the surrendering person changed from ${recorded} to ${replacement}.`,
  );
});

test("a date moved past the stay's outcome is refused, naming the outcome", async ({
  page,
}) => {
  // A deceased animal never comes back, so its outcome closes its last stay.
  // The day after it has to be one the picker offers, so an outcome recorded
  // today (another spec records one) is passed over.
  await gotoTable(page, "/dashboard/outcomes?type=DECEASED&pageSize=50");
  const rows = page.locator("tbody tr").filter({ hasNotText: "Reversed" });
  await expect(rows.first()).toBeVisible();
  let chosen:
    | { animalId: string; animalName: string; outcomeDay: string }
    | undefined;
  for (const row of await rows.all()) {
    // Columns: select, animal, recipient, type, outcome date.
    const outcomeDay = (await row.locator("td").nth(4).innerText()).trim();
    if (shiftDay(dayKeyOf(outcomeDay), 1) > shelterToday()) continue;
    const animalLink = row.getByRole("link").first();
    chosen = {
      animalId: (await animalLink.getAttribute("href"))!.split("/").pop()!,
      animalName: (await animalLink.innerText()).trim(),
      outcomeDay,
    };
    break;
  }
  if (!chosen) {
    throw new Error("No deceased outcome is dated before today.");
  }
  const { animalId, animalName, outcomeDay } = chosen;

  const intake = await latestIntakeOf(page, animalId, animalName);
  await openIntakeEdit(page, intake.row);
  const dayAfterOutcome = shiftDay(dayKeyOf(outcomeDay), 1);
  await pickIntakeDay(page, dayAfterOutcome);

  await page.getByRole("button", { name: "Update Intake" }).click();
  const refusal = `The intake date can't be after this stay's outcome on ${outcomeDay}.`;
  // Once under the picker, and once in the toast.
  await expect(page.getByText(refusal)).toHaveCount(2);
  await expect(page).toHaveURL(/\/dashboard\/intakes\/[^/]+\/edit$/);
});

test("a volunteer sees the intakes list with no way to edit", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: volunteerStatePath,
  });
  const page = await context.newPage();
  try {
    await gotoTable(page, INTAKES_PATH);
    await expect(page.getByRole("link", { name: "Intakes", exact: true })).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await expect(page.locator("tbody tr").first()).not.toContainText(
      "No results",
    );
    await expect(
      page.locator("tbody").getByRole("button", { name: /open menu/i }),
    ).toHaveCount(0);

    // The edit page turns them away too, rather than offering a form the
    // action would refuse.
    if (!notesEditUrl) throw new Error("The notes correction did not run.");
    await page.goto(notesEditUrl);
    await expect(page.getByText("Access Denied")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Update Intake" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
