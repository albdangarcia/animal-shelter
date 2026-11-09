import { expect, test, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";
import { firstRowIdByQuery } from "../support/note-audit";

// Every rule for medication orders and doses is covered by the database tests
// (prisma/medication-orders.test.ts and prisma/medication-doses.test.ts) and
// the unit tests of the slot rules and the page's view. These are the
// journeys only a browser can show: that the Medications page reaches those
// rules, that a refusal lands under its field, that Overview, History and the
// feed read what was recorded, and who sees which controls.

test.describe.configure({ mode: "serial" });

// The shelter's zone: the app's own fallback when its settings name none. The
// browser runs in it too, so the calendar's today is the shelter's today
// rather than the runner's.
const SHELTER_ZONE = process.env.SHELTER_TIMEZONE || "America/New_York";

test.use({ timezoneId: SHELTER_ZONE });

const staffStatePath = storageStatePathFor("medications-staff.state.json");
const volunteerStatePath = storageStatePathFor("medications-volunteer.state.json");

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
 * The younger Bruno, kennelled in A-3. Two hand-authored dogs share the name
 * and no other spec reads either medically, so this one is reached by id,
 * told apart by its birth day (a placement can move either of them). The dose
 * sheet's spec orders on the other.
 */
const youngerBrunoId = () =>
  withDb(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM animals
       WHERE name = 'Bruno' AND birth_date = '2023-04-11'
         AND "listingStatus" <> 'ARCHIVED'`,
    );
    if (rows.length !== 1) {
      throw new Error(`Expected one Bruno born 2023-04-11, found ${rows.length}.`);
    }
    return rows[0].id;
  });

/** How many activity rows the animal has, whatever their day. */
const activityRowCount = (animalId: string) =>
  withDb(async (client) => {
    const { rows } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM animal_activity_logs WHERE "animalId" = $1`,
      [animalId],
    );
    return rows[0].count;
  });

// Days are handled as `yyyy-MM-dd` keys, as the app stores them, so no
// comparison depends on the runner's zone or clock time. Each test reads
// today once, at its start. Orders start yesterday, so the slots it checks
// have ended whatever the time of day; of today's slots it checks only that
// Give is offered. A form defaults to the server's today when it opens, so
// every day a test asserts is picked rather than left to a default, and a
// day the server fills in (a dose given now, a discontinue from today) is
// accepted on the day after too, in case the test runs across the shelter's
// midnight. The day helpers are the ones in medical-conditions.spec.ts.
type DayKey = string;

/** Today in `zone`. "en-CA" formats dates in the `yyyy-MM-dd` shape. */
const todayIn = (zone: string): DayKey =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

const shiftDay = (day: DayKey, days: number): DayKey =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// The app prints a day as "Feb 1, 2026". Read at midnight UTC, so the key
// cannot slip a day.
const printedDay = (day: DayKey) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Either of two days as printed, for a day the server fills in itself. */
const eitherDay = (day: DayKey) =>
  `(?:${escapeRegExp(printedDay(day))}|${escapeRegExp(printedDay(shiftDay(day, 1)))})`;

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
 * Escape closes it. A required field keeps its day when that day is picked
 * again, so picking the day already shown is safe.
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

/** Opens the dialog a button opens, retrying a click lost to hydration. */
const openDialog = async (trigger: Locator, dialog: Locator) => {
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

const chooseOption = async (page: Page, combobox: Locator, option: RegExp | string) => {
  await combobox.click();
  await page.getByRole("option", { name: option }).click();
};

/**
 * The message under the form field in `scope` holding `control`, a locator
 * from the page, as a `has` filter reads it inside each field.
 */
const messageUnder = (scope: Locator, control: Locator) =>
  scope
    .locator('[data-slot="form-item"]')
    .filter({ has: control })
    .locator('[data-slot="form-message"]');

/**
 * One of the Medications page's three cards, by its heading. While the page
 * streams in, React can hold a hidden copy, so only the shown one counts.
 */
const card = (page: Page, heading: string) =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
    .filter({ visible: true });

/** An order's row on screen whose text holds `text` (its instructions). */
const orderRow = (scope: Locator, itemName: string, text: string) =>
  scope
    .locator(`li[aria-label^="${itemName} order, "]`)
    .filter({ hasText: text })
    .filter({ visible: true });

/**
 * The animal's activity feed, newest first. Its rows are read by their
 * rendered text (`useInnerText`): a row's item stays on screen, with its
 * timeline line, even when its content is hidden.
 */
const activityFeed = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({ hasText: "most recent activity logs for this animal" })
    .filter({ visible: true })
    .locator("li")
    .filter({ hasText: /\S/ })
    .filter({ visible: true });

/**
 * Voids every order an earlier attempt left on the animal (any not voided
 * whose instructions hold `marker`), reloading after each void since the
 * page streams in again. A voided order has a menu too (Order again), so its
 * row is left out by its name.
 */
const voidLeftoverOrders = async (page: Page, url: string, marker: string) => {
  const leftovers = () =>
    page
      .locator('li[aria-label*=" order, "]:not([aria-label$=", voided"])')
      .filter({ hasText: marker })
      .filter({ visible: true })
      .getByRole("button", { name: /^Actions for the / });
  const loaded = () => expect(card(page, "Past orders")).toBeVisible();
  await page.goto(url);
  await loaded();
  while ((await leftovers().count()) > 0) {
    await pickFromMenu(page, leftovers().first(), /^Void/);
    const voidDialog = page.getByRole("alertdialog");
    await voidDialog
      .getByLabel("Reason for voiding")
      .fill("Left by an earlier attempt of this test.");
    await voidDialog.getByRole("button", { name: "Void", exact: true }).click();
    await expect(voidDialog).toBeHidden();
    await page.goto(url);
    await loaded();
  }
};

/**
 * Orders `medication` from the Medications page, starting yesterday: the
 * frequency first (it moves the start to its default), then the start day,
 * which makes the first dose the frequency's first slot.
 */
const orderFromYesterday = async (
  page: Page,
  {
    medication,
    dose,
    frequency,
    yesterday,
    instructions,
  }: {
    medication: string;
    dose: string;
    frequency: string;
    yesterday: DayKey;
    instructions: string;
  },
) => {
  const form = page.getByRole("dialog", { name: "Order a medication" });
  await openDialog(page.getByRole("button", { name: "Order medication" }), form);
  await chooseOption(page, form.getByRole("combobox", { name: /^Medication/ }), medication);
  await form.getByRole("spinbutton", { name: /^Dose/ }).fill(dose);
  await chooseOption(page, form.getByRole("combobox", { name: /^How often/ }), frequency);
  await pickDay(page, form.getByRole("button", { name: /^Start date \*:/ }), yesterday);
  await form.getByRole("textbox", { name: /^Instructions/ }).fill(instructions);
  await form.getByRole("button", { name: "Order Medication" }).click();
  await expect(form).toBeHidden();
};

test.describe("as staff", () => {
  test.use({ storageState: staffStatePath });

  test("a twice-a-day order from yesterday: missed, given with details, refused, voided and given again, corrected and discontinued", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const today = todayIn(SHELTER_ZONE);
    const yesterday = shiftDay(today, -1);
    const y = printedDay(yesterday);
    // A retry or a repeat runs against the database an earlier attempt wrote
    // to, so each attempt marks the instructions of what it orders.
    const attempt = `${testInfo.retry}-${testInfo.repeatEachIndex}`;
    const marker = "Medications journey";
    const instructions = `${marker}: with food, attempt ${attempt}.`;
    const corrected = `${marker}: with food and water, attempt ${attempt}.`;
    const id = await youngerBrunoId();
    const activity = `/dashboard/animals/${id}`;
    const overview = `${activity}/medical`;
    const medications = `${overview}/medications`;

    await voidLeftoverOrders(page, medications, marker);
    const rowsBefore = await activityRowCount(id);

    // Ordering: the unit and route come from the medication, and an order
    // every few days is refused under its field until it says how many.
    await page.goto(medications);
    const form = page.getByRole("dialog", { name: "Order a medication" });
    await openDialog(page.getByRole("button", { name: "Order medication" }), form);
    await chooseOption(page, form.getByRole("combobox", { name: /^Medication/ }), "Doxycycline");
    await expect(form.getByRole("combobox", { name: /^Unit/ })).toHaveText("mg");
    await expect(form.getByRole("combobox", { name: /^Route/ })).toHaveText("Oral");
    await form.getByRole("spinbutton", { name: /^Dose/ }).fill("100");
    await chooseOption(page, form.getByRole("combobox", { name: /^How often/ }), "Every few days");
    await form.getByRole("button", { name: "Order Medication" }).click();
    await expect(
      messageUnder(form, page.getByRole("spinbutton", { name: /^Every how many days/ })),
    ).toHaveText("Give the days between doses.");
    await expect(form).toBeVisible();

    // Twice a day, from yesterday: its first dose is yesterday's AM.
    await chooseOption(page, form.getByRole("combobox", { name: /^How often/ }), "Twice a day");
    await expect(form.getByRole("spinbutton", { name: /^Every how many days/ })).toHaveCount(0);
    await pickDay(page, form.getByRole("button", { name: /^Start date \*:/ }), yesterday);
    await expect(form.getByRole("combobox", { name: /^First dose/ })).toHaveText("AM");
    await form.getByRole("textbox", { name: /^Instructions/ }).fill(instructions);
    await form.getByRole("button", { name: "Order Medication" }).click();
    await expect(form).toBeHidden();

    const order = orderRow(card(page, "Current orders"), "Doxycycline", `attempt ${attempt}.`);
    await expect(order).toHaveAttribute("aria-label", "Doxycycline order, active");
    await expect(order).toContainText(`Doxycycline · 100 mg oral · twice a day · from ${y}`);

    // Yesterday's AM has ended with nothing recorded: Missed. Recorded with
    // its details, at 08:30 yesterday, it reads as given then, and focus
    // stays on its slot.
    const sheet = card(page, "Dose sheet");
    const cell = (slot: "AM" | "PM") =>
      sheet.locator(`li[aria-label="Doxycycline, ${slot} dose on ${y}"]`).filter({ visible: true });
    await expect(cell("AM")).toContainText("Missed");
    await expect(cell("PM")).toContainText("Missed");
    await pickFromMenu(
      page,
      cell("AM").getByRole("button", { name: `Other ways to record Doxycycline, AM dose on ${y}` }),
      "Record with details…",
    );
    const details = page.getByRole("dialog", { name: `Record Doxycycline, AM dose on ${y}` });
    await expect(details.getByRole("radio", { name: "Given", exact: true })).toBeChecked();
    await pickDay(page, details.getByRole("button", { name: /^Date given or tried \*:/ }), yesterday);
    await details.getByLabel(/^Time/).fill("08:30");
    await details.getByLabel("Notes").fill(`Given at breakfast, attempt ${attempt}.`);
    await details.getByRole("button", { name: "Record Dose" }).click();
    await expect(details).toBeHidden();
    await expect(cell("AM")).toContainText("Given 8:30 AM · Olivia Chen");
    await expect(cell("AM")).toBeFocused();

    // Yesterday's PM refused, with why: accounted for, not missed.
    await pickFromMenu(
      page,
      cell("PM").getByRole("button", { name: `Other ways to record Doxycycline, PM dose on ${y}` }),
      "Refused…",
    );
    const refused = page.getByRole("dialog", {
      name: `Record Doxycycline, PM dose on ${y} as refused`,
    });
    await refused.getByLabel("Reason").fill(`Spat it out, attempt ${attempt}.`);
    await refused.getByRole("button", { name: "Record Dose" }).click();
    await expect(refused).toBeHidden();
    await expect(cell("PM")).toContainText(`Refused: Spat it out, attempt ${attempt}.`);
    await expect(cell("PM")).not.toContainText("Missed");

    // The AM dose voided: it stays, struck through, and the slot is missed
    // again until it is given again, now, a day late.
    await cell("AM")
      .getByRole("button", { name: `Void Doxycycline, AM dose on ${y}, given 8:30 AM` })
      .click();
    const voidDose = page.getByRole("alertdialog", {
      name: `Void Doxycycline, AM dose on ${y} (given 8:30 AM)?`,
    });
    await voidDose.getByLabel("Reason for voiding").fill("Recorded on the wrong slot.");
    await voidDose.getByRole("button", { name: "Void Dose" }).click();
    await expect(voidDose).toBeHidden();
    await expect(cell("AM")).toContainText("Voided by Olivia Chen: Recorded on the wrong slot.");
    await expect(cell("AM")).toContainText("Missed");
    await expect(cell("AM").getByText("Given 8:30 AM · Olivia Chen")).toHaveClass(/line-through/);

    await cell("AM").getByRole("button", { name: `Give Doxycycline, AM dose on ${y}` }).click();
    await expect(cell("AM")).toContainText(
      new RegExp(`Given ${eitherDay(today)}, \\d{1,2}:\\d\\d [AP]M · Olivia Chen`),
    );
    await expect(cell("AM")).not.toContainText("Missed");
    await expect(cell("AM")).toBeFocused();

    // Overview's Today's doses offers today's slots. Loading the page leaves
    // focus and the scroll where they were: no open slot takes them.
    await page.goto(overview);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const todays = page
      .getByRole("region", { name: "Today's doses" })
      .getByRole("listitem")
      .filter({ hasText: instructions });
    await expect(
      todays.getByRole("button", { name: /^Give Doxycycline, (AM|PM) dose on / }).first(),
    ).toBeVisible();

    // History's Medication filter lists the order on its start day.
    await page.goto(`${overview}/history?kind=MEDICATION`);
    const historyRow = orderRow(page.locator("main"), "Doxycycline", instructions);
    await expect(historyRow).toHaveCount(1);
    await expect(historyRow).toBeVisible();
    await expect(historyRow).toHaveAttribute("aria-label", "Doxycycline order, active");
    await expect(historyRow).toContainText(`Doxycycline · 100 mg oral · twice a day · from ${y}`);

    // A correction: a dose is recorded, so the start can't move; the
    // instructions can.
    await page.goto(medications);
    await pickFromMenu(
      page,
      order.getByRole("button", { name: "Actions for the Doxycycline order (active)" }),
      "Edit",
    );
    const edit = page.getByRole("dialog", { name: "Edit the Doxycycline order" });
    await expect(edit.getByRole("textbox", { name: "Start date" })).toBeDisabled();
    await expect(edit.getByRole("textbox", { name: "Start date" })).toHaveValue(yesterday);
    await edit.getByRole("textbox", { name: /^Instructions/ }).fill(corrected);
    await edit.getByRole("button", { name: "Save Changes" }).click();
    await expect(edit).toBeHidden();
    await expect(order).toContainText(corrected);

    // Discontinued from today: it moves to the past orders, and focus goes
    // to the current orders' heading, since its menu went with it.
    await pickFromMenu(
      page,
      order.getByRole("button", { name: "Actions for the Doxycycline order (active)" }),
      /^Discontinue/,
    );
    const discontinue = page.getByRole("dialog", { name: "Discontinue the Doxycycline order?" });
    await discontinue.getByLabel(/^Reason/).fill(`Course stopped, attempt ${attempt}.`);
    await discontinue.getByRole("button", { name: "Discontinue", exact: true }).click();
    await expect(discontinue).toBeHidden();
    const stopped = orderRow(card(page, "Past orders"), "Doxycycline", corrected);
    await expect(stopped).toHaveAttribute(
      "aria-label",
      new RegExp(`^Doxycycline order, discontinued from ${eitherDay(today).toLowerCase()}$`),
    );
    await expect(stopped).toContainText(`Course stopped, attempt ${attempt}.`);
    await expect(orderRow(card(page, "Current orders"), "Doxycycline", corrected)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Current orders" })).toBeFocused();

    // The feed, newest first: a row for each order change, the refused dose
    // and the voided dose, and none for either dose given. The animal has
    // exactly those five rows more than before, so no row was written for a
    // given dose either, even one dated on its day and sorted further down.
    await page.goto(activity);
    const feed = activityFeed(page);
    await expect(feed.nth(0)).toContainText("discontinued a medication", { useInnerText: true });
    await expect(feed.nth(1)).toContainText("corrected a medication order", { useInnerText: true });
    await expect(feed.nth(2)).toContainText("voided a dose", { useInnerText: true });
    await expect(feed.nth(3)).toContainText("recorded a dose not given", { useInnerText: true });
    await expect(feed.nth(4)).toContainText("ordered a medication", { useInnerText: true });
    expect(await activityRowCount(id)).toBe(rowsBefore + 5);
    await feed.nth(3).getByRole("button", { name: "Show details" }).click();
    await expect(feed.nth(3)).toContainText(`Doxycycline PM dose on ${y}: refused.`, {
      useInnerText: true,
    });
  });

  test("an as-needed order takes a dose on a day it ran, from Record a dose", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const today = todayIn(SHELTER_ZONE);
    const yesterday = shiftDay(today, -1);
    const y = printedDay(yesterday);
    const attempt = `${testInfo.retry}-${testInfo.repeatEachIndex}`;
    const marker = "As-needed journey";
    const instructions = `${marker}: for pain, attempt ${attempt}.`;
    const id = await youngerBrunoId();
    const medications = `/dashboard/animals/${id}/medical/medications`;

    await voidLeftoverOrders(page, medications, marker);

    // As needed, from yesterday: no slots, and a capsule from the catalog.
    await page.goto(medications);
    await orderFromYesterday(page, {
      medication: "Gabapentin",
      dose: "1",
      frequency: "As needed",
      yesterday,
      instructions,
    });
    const order = orderRow(card(page, "Current orders"), "Gabapentin", instructions);
    await expect(order).toHaveAttribute("aria-label", "Gabapentin order, active");
    await expect(order).toContainText(`Gabapentin · 1 capsule oral · as needed · from ${y}`);
    await expect(order).toContainText("Doses so far: No doses yet");

    // A dose yesterday at 09:15, through Record a dose. Focus goes back to
    // the button.
    const record = order.getByRole("button", { name: "Record a Gabapentin dose" });
    const dialog = page.getByRole("dialog", { name: "Record a Gabapentin dose" });
    await openDialog(record, dialog);
    await pickDay(page, dialog.getByRole("button", { name: /^Date given \*:/ }), yesterday);
    await dialog.getByLabel(/^Time/).fill("09:15");
    await dialog.getByRole("button", { name: "Record Dose" }).click();
    await expect(dialog).toBeHidden();
    await expect(record).toBeFocused();
    await expect(order).toContainText("Doses so far: 1 given");
    await expect(
      card(page, "Dose sheet")
        .locator(`li[aria-label="Gabapentin, as-needed dose on ${y}"]`)
        .filter({ visible: true }),
    ).toContainText("Given 9:15 AM · Olivia Chen");

    // Discontinued, so the animal is left with nothing running.
    await pickFromMenu(
      page,
      order.getByRole("button", { name: "Actions for the Gabapentin order (active)" }),
      /^Discontinue/,
    );
    const discontinue = page.getByRole("dialog", { name: "Discontinue the Gabapentin order?" });
    await discontinue.getByLabel(/^Reason/).fill(`No more pain, attempt ${attempt}.`);
    await discontinue.getByRole("button", { name: "Discontinue", exact: true }).click();
    await expect(discontinue).toBeHidden();
    await expect(orderRow(card(page, "Past orders"), "Gabapentin", instructions)).toHaveCount(1);
  });
});

test.describe("as a volunteer", () => {
  test.use({ storageState: volunteerStatePath });

  test("reads the orders and the dose sheet, with no controls to order, give, record or void", async ({
    page,
  }) => {
    // Fido's seeded course: doxycycline twice a day, a dose refused two days
    // before the seed ran, and a voided order before it.
    const id = await firstRowIdByQuery(page, "/dashboard/animals", "Fido");
    const overview = `/dashboard/animals/${id}/medical`;

    await page.goto(`${overview}/medications`);
    const shown = (heading: string, label: string) =>
      card(page, heading).locator(`li[aria-label="${label}"]`).filter({ visible: true });
    await expect(shown("Current orders", "Doxycycline order, active")).toHaveCount(1);
    await expect(
      card(page, "Dose sheet").getByText(/^Refused: Spat it out/).first(),
    ).toBeVisible();
    await expect(shown("Past orders", "Doxycycline order, voided")).toHaveCount(1);

    for (const name of [
      "Order medication",
      /^Give /,
      /^Other ways to record /,
      /^Void /,
      /^Actions for the /,
    ]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }

    // Rusty's seeded gabapentin as needed, which staff can record a dose of
    // from its row: the volunteer can't.
    const rusty = await firstRowIdByQuery(page, "/dashboard/animals", "Rusty");
    await page.goto(`/dashboard/animals/${rusty}/medical/medications`);
    await expect(shown("Current orders", "Gabapentin order, active")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Record a .* dose$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Give / })).toHaveCount(0);

    // Fido's Overview: Today's doses reads, with no Give.
    await page.goto(overview);
    const todays = page.getByRole("region", { name: "Today's doses" });
    await expect(todays).toContainText("Doxycycline · 100 mg oral · twice a day");
    await expect(todays.getByRole("button", { name: /^Give / })).toHaveCount(0);
  });
});
