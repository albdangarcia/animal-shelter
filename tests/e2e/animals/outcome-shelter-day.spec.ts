import { test, expect, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../../playwright/env";
import {
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// An outcome date is the calendar day the animal left, and these specs pin the
// two ways that can go wrong.
//
// The first is the picker: the day stored must be the day the staff member saw
// themselves click, whatever zone their browser is in. Submitting the picked
// Date instead stored its local midnight, which is the previous day for
// anyone ahead of the shelter — so that browser is driven from a zone well
// east of the shelter's here.
//
// The second is the readers: the report and the analytics chart both bucket by
// day, and must land the same outcome on the same one.

const adminPassword = process.env.ADMIN_PASSWORD;
const adminState = storageStatePathFor("outcome-shelter-day-admin.state.json");

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the outcome shelter-day E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath: adminState,
  });
});

test.use({ storageState: adminState });

const SHELTER_ZONE = "America/New_York";

test.skip(
  Boolean(process.env.SHELTER_TIMEZONE) &&
    process.env.SHELTER_TIMEZONE !== SHELTER_ZONE,
  "These specs are written against a shelter in America/New_York.",
);

/** Today in `zone`, as `yyyy-MM-dd` — "en-CA" formats dates in that shape. */
const todayIn = (zone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());

const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const findAnimalId = async (page: Page, name: string) => {
  await page.goto(`/dashboard/animals?query=${name}`);
  const row = page.locator("tbody tr").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  const href = await row.getByRole("link").first().getAttribute("href");
  if (!href) throw new Error(`No animal row found for ${name}`);
  return href.split("/").pop() as string;
};

// Clicking before hydration makes the browser submit the form itself (a GET
// that appends the fields to the URL) and nothing reaches the action. React
// marks each DOM node it has attached to, so wait for that on the form.
const waitForFormHydration = async (page: Page) => {
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Process Outcome" }) });
  await expect(form).toBeVisible();
  await expect
    .poll(() =>
      form.evaluate((el) =>
        Object.keys(el).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
};

// The select can drop a click that lands before hydration settles; re-clicking
// an open one would shut it, so click again only while it is still closed.
const chooseOutcomeType = async (page: Page, label: string) => {
  const option = page.getByRole("option", { name: label });
  await expect(async () => {
    if (!(await option.isVisible())) {
      await page.getByLabel("Outcome Type").click();
    }
    await expect(option).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await option.click();
};

const outcomeDateTrigger = (page: Page) =>
  page.getByRole("button", { name: /^Date of Outcome \*:/ });

// The popover does not close on select, so it may already be open; clicking
// the trigger then would shut it.
const openOutcomeCalendar = async (page: Page): Promise<Locator> => {
  const calendar = page.getByRole("dialog");
  await expect(async () => {
    if (!(await calendar.isVisible())) {
      await outcomeDateTrigger(page).click();
    }
    await expect(calendar).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return calendar;
};

// Clicks one `yyyy-MM-dd` in the picker, stepping back a month at a time until
// its cell is on the grid. Every day button carries the day it draws, so the
// cell is addressed by the day itself rather than by position.
const pickOutcomeDay = async (page: Page, day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  const cell = `button[data-day="${month}/${date}/${year}"]`;

  for (let months = 0; months < 24; months += 1) {
    const calendar = await openOutcomeCalendar(page);
    if (await calendar.locator(cell).first().isVisible()) break;
    await calendar
      .getByRole("button", { name: "Go to the Previous Month" })
      .click();
  }

  const calendar = await openOutcomeCalendar(page);
  await expect(calendar.locator(cell).first()).toBeVisible();
  await calendar.locator(cell).first().click();
  await expect(outcomeDateTrigger(page)).toBeVisible();
};

const processOutcome = async (page: Page, animalId: string, day?: string) => {
  await page.goto(`/dashboard/outcomes/create?animalId=${animalId}`);
  await waitForFormHydration(page);
  await chooseOutcomeType(page, "Deceased");
  if (day) await pickOutcomeDay(page, day);
  await page.getByRole("button", { name: "Process Outcome" }).click();
  await page.waitForURL("**/dashboard/outcomes", { timeout: 60_000 });
};

/**
 * The day the animal's current stay began. An outcome dated before it is
 * refused, and these animals are seeded in care with a stay of random length,
 * so each spec's day is moved up to it when it would fall earlier.
 */
const latestIntakeDay = async (animalId: string) => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ day: string }>(
      `SELECT max("intakeDate") AS day FROM intakes WHERE "animalId" = $1`,
      [animalId],
    );
    return rows[0].day;
  } finally {
    await client.end();
  }
};

const notBefore = (day: string, earliest: string) =>
  day < earliest ? earliest : day;

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );

/** The day the column actually holds, read as text so nothing re-reads it. */
const storedOutcomeDay = async (animalId: string) => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ stored: string }>(
      `SELECT "outcomeDate" AS stored FROM outcomes WHERE "animalId" = $1`,
      [animalId],
    );
    expect(rows).toHaveLength(1);
    return rows[0].stored;
  } finally {
    await client.end();
  }
};

// "Total outcomes" on the report for exactly one day.
const outcomesCountedOn = async (page: Page, day: string) => {
  await page.goto(`/dashboard/reports/outcomes?from=${day}&to=${day}`);
  const card = page.getByText("Total outcomes", { exact: true }).locator("..");
  await expect(card).toBeVisible();
  const count = Number((await card.innerText()).replace(/\D+/g, " ").trim());
  if (Number.isNaN(count)) throw new Error("Could not read the outcome count.");
  return count;
};

test.describe("a browser far east of the shelter", () => {
  // Auckland runs 16–18 hours ahead of New York, so its midnight is always the
  // previous day at the shelter. That is the gap this spec exists for.
  test.use({ timezoneId: "Pacific/Auckland" });

  test("stores the day that was picked, not the day before it", async ({
    page,
  }) => {
    // Nutmeg is a seeded in-care cat that no other spec touches.
    const animalId = await findAnimalId(page, "Nutmeg");
    const picked = notBefore(
      shiftDay(todayIn("Pacific/Auckland"), -5),
      await latestIntakeDay(animalId),
    );
    const dayBefore = shiftDay(picked, -1);

    const countedBefore = await outcomesCountedOn(page, picked);
    const dayBeforeCountedBefore = await outcomesCountedOn(page, dayBefore);

    await processOutcome(page, animalId, picked);

    expect(await storedOutcomeDay(animalId)).toBe(picked);
    expect(await outcomesCountedOn(page, picked)).toBe(countedBefore + 1);
    expect(await outcomesCountedOn(page, dayBefore)).toBe(
      dayBeforeCountedBefore,
    );
  });
});

// The chart's tooltip label for a `yyyy-MM-dd` day, e.g. "Jul 15".
const chartLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// The chart plots the last 90 days, today included, one point per day, so the
// point for a day `daysAgo` back sits at index 89 - daysAgo of 0..89. Hovering
// there opens the tooltip for that day, whose label is checked before its
// count is trusted.
const chartOutcomesOn = async (page: Page, day: string, daysAgo: number) => {
  await page.goto("/dashboard");
  const plot = page.locator(".recharts-cartesian-grid").first();
  await expect(plot).toBeVisible();
  const box = await plot.boundingBox();
  if (!box) throw new Error("The chart has no plot area.");

  await page.mouse.move(
    box.x + (box.width * (89 - daysAgo)) / 89,
    box.y + box.height / 2,
  );
  const tooltip = page.locator(".recharts-tooltip-wrapper");
  await expect(tooltip).toContainText(chartLabel(day));
  const match = (await tooltip.innerText()).match(/Outcomes\s*(\d+)/);
  if (!match) throw new Error("The chart tooltip shows no outcome count.");
  return Number(match[1]);
};

test.describe("the analytics chart", () => {
  test.use({ timezoneId: SHELTER_ZONE });

  test("counts an outcome on the same day the report does", async ({
    page,
  }) => {
    const shelterToday = todayIn(SHELTER_ZONE);
    const animalId = await findAnimalId(page, "Marigold");
    const day = notBefore(
      shiftDay(shelterToday, -10),
      await latestIntakeDay(animalId),
    );
    const daysAgo = daysBetween(day, shelterToday);
    const dayAfter = shiftDay(day, 1);

    const reportBefore = await outcomesCountedOn(page, day);
    const chartBefore = await chartOutcomesOn(page, day, daysAgo);
    const dayAfterBefore = await chartOutcomesOn(page, dayAfter, daysAgo - 1);
    expect(chartBefore).toBe(reportBefore);
    // Today is the chart's last point, and counts the same as the report does.
    expect(await chartOutcomesOn(page, shelterToday, 0)).toBe(
      await outcomesCountedOn(page, shelterToday),
    );

    await processOutcome(page, animalId, day);

    expect(await outcomesCountedOn(page, day)).toBe(reportBefore + 1);
    expect(await chartOutcomesOn(page, day, daysAgo)).toBe(chartBefore + 1);
    expect(await chartOutcomesOn(page, dayAfter, daysAgo - 1)).toBe(
      dayAfterBefore,
    );
  });
});
