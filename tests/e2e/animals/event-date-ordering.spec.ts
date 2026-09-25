import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  fillStable,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// Every form that records or moves an intake or outcome day refuses one that
// would put the animal's intakes and outcomes out of order, or that is in the
// future, and says why under the date picker. The picker itself only stops a
// future day, and only against the day the page was rendered on, so these
// drive days the picker allows and the server must refuse.

const adminPassword = process.env.ADMIN_PASSWORD;

test.describe.configure({ mode: "serial" });

const storageStatePath = storageStatePathFor("event-date-ordering.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the event date ordering E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today, which bounds the picker, is
// the shelter's today rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ storageState: storageStatePath, timezoneId: SHELTER_ZONE });

const OUTCOMES_PATH = "/dashboard/outcomes";

// Every other spec and support file, read as text. This spec archives and
// re-intakes its animals, so it only takes animals no other spec names.
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

const withDb = async <T>(run: (client: pg.Client) => Promise<T>) => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

/**
 * In-care animals on their first stay, with nothing that an outcome would
 * also close (an application, a foster placement), that no other spec names.
 * Each one's only intake is moved to `intakeDay`, so every day this spec
 * picks is placed against a known timeline. Moving the only event cannot put
 * anything out of order.
 */
const takeFirstStayAnimals = async (count: number, intakeDay: DayKey) =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: string; name: string }>(
      `SELECT a.id, a.name FROM animals a
       WHERE a."listingStatus" IN ('DRAFT', 'PUBLISHED')
         AND (SELECT count(*) FROM intakes i WHERE i."animalId" = a.id) = 1
         AND NOT EXISTS (SELECT 1 FROM outcomes o WHERE o."animalId" = a.id)
         AND NOT EXISTS (
           SELECT 1 FROM adoption_applications p WHERE p.animal_id = a.id)
         AND NOT EXISTS (
           SELECT 1 FROM foster_placements f WHERE f.animal_id = a.id)
       ORDER BY a."listingStatus" = 'DRAFT' DESC, a.name, a.id`,
    );
    const names = new Set<string>();
    const picked = rows.filter((row) => {
      // Two animals of one name would be told apart by id alone, and the
      // outcome list is searched by name.
      if (names.has(row.name) || isNamedElsewhere(row.name)) return false;
      names.add(row.name);
      return true;
    });
    if (picked.length < count) {
      throw new Error("Not enough first-stay animals free of other specs.");
    }
    const chosen = picked.slice(0, count);
    for (const animal of chosen) {
      await client.query(
        `UPDATE intakes SET "intakeDate" = $2 WHERE "animalId" = $1`,
        [animal.id, intakeDay],
      );
    }
    return chosen;
  });

const liveOutcomeDays = (animalId: string) =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: string; day: string }>(
      `SELECT id, "outcomeDate" AS day FROM outcomes
       WHERE "animalId" = $1 AND "reversedAt" IS NULL
       ORDER BY "outcomeDate"`,
      [animalId],
    );
    return rows;
  });

const intakeDays = (animalId: string) =>
  withDb(async (client) => {
    const { rows } = await client.query<{ day: string }>(
      `SELECT "intakeDate" AS day FROM intakes
       WHERE "animalId" = $1 ORDER BY "intakeDate"`,
      [animalId],
    );
    return rows.map((row) => row.day);
  });

// Clicking submit before hydration makes the browser submit the form itself (a
// GET that appends the fields to the URL) and nothing reaches the action. React
// marks each DOM node it has attached to, so wait for that on the form.
const waitForFormHydration = async (page: Page, submitName: string) => {
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: submitName }) });
  await expect(form).toBeVisible();
  await expect
    .poll(() =>
      form.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
};

// A Radix select can drop a click that lands before hydration settles;
// re-clicking an open one would shut it, so click again only while it is
// still closed. `option` null takes the first one offered.
const chooseFromSelect = async (
  page: Page,
  label: string,
  option: string | null,
) => {
  const options = page.getByRole("option");
  const choice =
    option === null
      ? options.first()
      : page.getByRole("option", { name: option, exact: true });
  await expect(async () => {
    if (!(await choice.isVisible())) {
      await page.getByLabel(label, { exact: true }).click();
    }
    await expect(choice).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await choice.click();
  await expect(options).toHaveCount(0);
};

const OUTCOME_DATE = /^Date of Outcome \*:/;
const INTAKE_DATE = /^Intake Date:/;

const dateTrigger = (page: Page, label: RegExp) =>
  page.getByRole("button", { name: label });

// The popover does not close on select, so it may already be open; clicking
// the trigger then would shut it.
const openCalendar = async (page: Page, label: RegExp) => {
  const calendar = page.getByRole("dialog");
  await expect(async () => {
    if (!(await calendar.isVisible())) {
      await dateTrigger(page, label).click();
    }
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return calendar;
};

// data-day is the browser's en-US short date: M/D/YYYY, no padding.
const dataDayOf = (day: DayKey) => {
  const [year, month, date] = day.split("-").map(Number);
  return `${month}/${date}/${year}`;
};

const monthOf = (dataDay: string) => {
  const [month, , year] = dataDay.split("/").map(Number);
  return year * 12 + month;
};

// react-day-picker stamps every day button with data-day, the only
// unambiguous handle. The month shown on opening is not always the one
// holding the day, so it steps towards the day's month, reading the shown
// month off a cell from the middle of the grid, which is never an outside
// day.
const pickDay = async (page: Page, label: RegExp, day: DayKey) => {
  const calendar = await openCalendar(page, label);
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

/** The message shown under the date picker named `label`. */
const messageUnder = (page: Page, label: RegExp) =>
  page
    .locator('[data-slot="form-item"]')
    .filter({ has: dateTrigger(page, label) })
    .locator('[data-slot="form-message"]');

const toast = (page: Page, message: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: message });

// A refusal leaves the form where it was, says why under the picker, and
// repeats it as the toast.
const expectRefusal = async (
  page: Page,
  label: RegExp,
  message: string,
  pathname: string,
) => {
  await expect(messageUnder(page, label)).toHaveText(message);
  await expect(toast(page, message)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(pathname);
};

const gotoOutcomeForm = async (page: Page, animalId: string) => {
  await page.goto(`${OUTCOMES_PATH}/create?animalId=${animalId}`);
  await waitForFormHydration(page, "Process Outcome");
  // "Other" needs no partner, owner or application.
  await chooseFromSelect(page, "Outcome Type *", "Other");
};

const recordOutcome = async (page: Page, animalId: string, day: DayKey) => {
  await gotoOutcomeForm(page, animalId);
  await pickDay(page, OUTCOME_DATE, day);
  await page.getByRole("button", { name: "Process Outcome" }).click();
  await expect(toast(page, "Outcome processed successfully.")).toBeVisible();
  await waitForPathname(page, OUTCOMES_PATH);
};

const gotoReIntakeForm = async (page: Page, animalId: string) => {
  await page.goto(`/dashboard/animals/${animalId}/intake/create`);
  await waitForFormHydration(page, "Process Re-Intake");
  // "Seize" needs no partner, person or address.
  await chooseFromSelect(page, "Intake Type", "Seize");
};

const reIntake = async (page: Page, animalId: string, day: DayKey) => {
  await gotoReIntakeForm(page, animalId);
  await pickDay(page, INTAKE_DATE, day);
  await page.getByRole("button", { name: "Process Re-Intake" }).click();
  await expect(
    toast(page, "Animal re-intake processed successfully."),
  ).toBeVisible();
  await waitForPathname(page, `/dashboard/animals/${animalId}`);
};

// The row's Radix menu occasionally swallows the first click right after a
// navigation, before hydration settles. Retry, re-clicking only while the
// menu is closed so it is never toggled shut.
const openRowMenu = async (row: Locator, itemName: string | RegExp) => {
  const trigger = row.getByRole("button", { name: "Open menu" });
  const item = row.page().getByRole("menuitem", { name: itemName });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await item.isVisible())) {
      await trigger.click();
    }
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return item;
};

// Placed against a known timeline in `beforeAll` of the first case: `ordered`
// takes its outcome, re-intake and correction in turn, `duplicated` the
// no-regression case.
const today = todayIn(SHELTER_ZONE);
const firstIntake = shiftDay(today, -60);
let ordered: { id: string; name: string };
let duplicated: { id: string; name: string };

test.beforeAll(async () => {
  [ordered, duplicated] = await takeFirstStayAnimals(2, firstIntake);
});

test("recording an outcome dated before the stay's intake is refused under the picker", async ({
  page,
}) => {
  const createPath = `${OUTCOMES_PATH}/create`;
  await gotoOutcomeForm(page, ordered.id);
  await pickDay(page, OUTCOME_DATE, shiftDay(firstIntake, -5));
  await page.getByRole("button", { name: "Process Outcome" }).click();

  await expectRefusal(
    page,
    OUTCOME_DATE,
    `The outcome date can't be before this stay's intake on ${printedDay(firstIntake)}.`,
    createPath,
  );
  expect(await liveOutcomeDays(ordered.id)).toEqual([]);

  // Within the stay, the same form records it.
  await recordOutcome(page, ordered.id, shiftDay(today, -50));
  expect(
    (await liveOutcomeDays(ordered.id)).map((outcome) => outcome.day),
  ).toEqual([shiftDay(today, -50)]);
});

test("a re-intake dated before the last outcome is refused under the picker", async ({
  page,
}) => {
  const outcomeDay = shiftDay(today, -50);
  const reIntakePath = `/dashboard/animals/${ordered.id}/intake/create`;

  await gotoReIntakeForm(page, ordered.id);
  await pickDay(page, INTAKE_DATE, shiftDay(outcomeDay, -5));
  await page.getByRole("button", { name: "Process Re-Intake" }).click();

  await expectRefusal(
    page,
    INTAKE_DATE,
    `The intake date can't be before the previous outcome on ${printedDay(outcomeDay)}.`,
    reIntakePath,
  );
  expect(await intakeDays(ordered.id)).toEqual([firstIntake]);

  await reIntake(page, ordered.id, shiftDay(today, -40));
  expect(await intakeDays(ordered.id)).toEqual([
    firstIntake,
    shiftDay(today, -40),
  ]);
});

test("an outcome corrected past the next intake is refused under the picker", async ({
  page,
}) => {
  const [outcome] = await liveOutcomeDays(ordered.id);
  const editPath = `${OUTCOMES_PATH}/${outcome.id}/edit`;
  const nextIntake = shiftDay(today, -40);

  await page.goto(editPath);
  await waitForFormHydration(page, "Update Outcome");
  await pickDay(page, OUTCOME_DATE, shiftDay(nextIntake, 5));
  await page.getByRole("button", { name: "Update Outcome" }).click();

  await expectRefusal(
    page,
    OUTCOME_DATE,
    `The outcome date can't be after the next intake on ${printedDay(nextIntake)}.`,
    editPath,
  );
  expect(await liveOutcomeDays(ordered.id)).toEqual([outcome]);
});

// The create form fills in today, as the page saw it, and the picker bounds
// the day by the same. A form opened on one side of the shelter's midnight
// and saved on the other can send a day that is still tomorrow for the
// server. That is staged here by moving the shelter's zone between the two:
// from Kiritimati (UTC+14) to Pago Pago (UTC-11), whose today is always at
// least a day behind.
test("creating an animal with a future intake day is refused under the picker", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const name = `Tomorrow's arrival ${Date.now()}`;

  const setZone = (zone: string) =>
    withDb((client) =>
      client.query(`UPDATE shelter_settings SET timezone = $1`, [zone]),
    );
  const storedZone = await withDb(async (client) => {
    const { rows } = await client.query<{ timezone: string }>(
      `SELECT timezone FROM shelter_settings`,
    );
    return rows[0]?.timezone;
  });
  if (!storedZone) {
    throw new Error("The shelter settings row is missing.");
  }

  try {
    await setZone("Pacific/Kiritimati");
    await page.goto("/dashboard/animals/create");
    await waitForFormHydration(page, "Create Intake");

    await fillStable(page.getByLabel("Animal Name", { exact: true }), name);
    await chooseFromSelect(page, "Species", null);
    await chooseFromSelect(page, "Breed", null);
    await chooseFromSelect(page, "Primary Color", null);
    await chooseFromSelect(page, "Intake Type", "Seize");
    // Any day on the grid the page opens on is not in its future.
    const birthCalendar = await openCalendar(page, /^Estimated Birth Date:/);
    await birthCalendar
      .locator("button[data-day]:not([disabled])")
      .nth(0)
      .click();
    await page.keyboard.press("Escape");
    await expect(birthCalendar).toBeHidden();

    await setZone("Pacific/Pago_Pago");
    await page.getByRole("button", { name: "Create Intake" }).click();

    await expectRefusal(
      page,
      INTAKE_DATE,
      "The intake date can't be in the future.",
      "/dashboard/animals/create",
    );
  } finally {
    await setZone(storedZone);
  }

  const created = await withDb(async (client) => {
    const { rows } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM animals WHERE name = $1`,
      [name],
    );
    return rows[0].count;
  });
  expect(created).toBe(0);
});

// Reversing an outcome that is not the animal's latest leaves two intakes in
// a row, which is the truth: the animal never left between them. That break
// is not one a later re-intake adds, so the animal can still come back.
test("an animal left with a duplicate intake by a reversal can still be re-intaked", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await recordOutcome(page, duplicated.id, shiftDay(today, -50));
  await reIntake(page, duplicated.id, shiftDay(today, -40));
  await recordOutcome(page, duplicated.id, shiftDay(today, -30));

  // Newest first, so the first outcome is the second row.
  await page.goto(
    `${OUTCOMES_PATH}?query=${encodeURIComponent(duplicated.name)}&pageSize=50`,
  );
  const rows = page.locator("tbody tr").filter({
    has: page.locator(`a[href="/dashboard/animals/${duplicated.id}"]`),
  });
  await expect(rows).toHaveCount(2);
  const first = rows.nth(1);
  await expect(first).toContainText(printedDay(shiftDay(today, -50)));
  await (await openRowMenu(first, /^Reverse/)).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Reason for reversal")
    .fill(`Recorded against the wrong animal ${Date.now()}`);
  await dialog.getByRole("button", { name: "Reverse Outcome" }).click();
  await expect(toast(page, /Outcome reversed\./)).toBeVisible();
  await expect(dialog).toBeHidden();

  expect(
    (await liveOutcomeDays(duplicated.id)).map((outcome) => outcome.day),
  ).toEqual([shiftDay(today, -30)]);

  await reIntake(page, duplicated.id, shiftDay(today, -20));
  expect(await intakeDays(duplicated.id)).toEqual([
    firstIntake,
    shiftDay(today, -40),
    shiftDay(today, -20),
  ]);
});
