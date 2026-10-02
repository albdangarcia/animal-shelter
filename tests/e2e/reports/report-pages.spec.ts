import { expect, test, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// Each report page renders its report. What the numbers are is proved below
// the browser: the length-of-stay arithmetic in a unit test
// (app/lib/utils/length-of-stay.test.ts) and what it reads in a database test
// (prisma/length-of-stay-report.test.ts). This only shows that each page is
// wired to its data and draws it. The outcomes report
// is opened by animals/outcome-reversal and animals/outcome-shelter-day.

const adminPassword = process.env.ADMIN_PASSWORD;

const storageStatePath = storageStatePathFor("report-pages.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the report pages E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

test.use({ storageState: storageStatePath });

// The page's own content, below the site header, whose title is an h1 too.
const content = (page: Page) => page.locator("main > div");

// The innermost card holding a title: a wrapping card, if any, comes first in
// document order.
const card = (page: Page, title: string) =>
  content(page)
    .locator('[data-slot="card"]')
    .filter({ hasText: title })
    .last();

// Days are `yyyy-MM-dd` keys, as the app stores them.
const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
  86_400_000;

// The reports print a day as "Feb 1, 2026", read here at midnight UTC so the
// key cannot slip a day.
const dayKeyOf = (printed: string) =>
  new Date(`${printed} UTC`).toISOString().slice(0, 10);

test("the reports overview draws each report's card", async ({ page }) => {
  await page.goto("/dashboard/reports");
  await expect(
    content(page).getByRole("heading", { name: "Reports" }),
  ).toBeVisible();
  // The cards stream in behind skeletons that carry no text, so a label is
  // only there once its card has its data.
  for (const label of [
    "Outcome statistics",
    "Intake vs outcome",
    "Length of stay",
    "Intake sources",
  ]) {
    await expect(content(page).getByText(label, { exact: true })).toBeVisible();
  }
});

test("the intake sources report draws its trend and breakdown", async ({
  page,
}) => {
  // The widest range the report takes, so the seeded intakes fall inside it
  // on any day of the year (the default starts on January 1). The runner's
  // day stands in for the shelter's: a day either way changes nothing here.
  const today = new Date().toISOString().slice(0, 10);
  await page.goto(
    `/dashboard/reports/intakes?from=${shiftDay(today, -730)}&to=${today}`,
  );
  await expect(
    content(page).getByRole("heading", { name: "Intake sources" }),
  ).toBeVisible();
  // Every month gets a bar, but one with no intakes has no height, so a
  // visible bar is a month with intakes.
  await expect(
    card(page, "Monthly intake trend")
      .locator(".recharts-bar-rectangle")
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  // Each intake type prints its count and its share, e.g. "12 · 40.0%".
  const breakdown = card(page, "Intakes by source type");
  await expect(breakdown.getByText(/^\d+ · \d+\.\d%$/).first()).toBeVisible();
  await expect(
    breakdown.getByText("No intakes recorded in this period."),
  ).toHaveCount(0);
});

test("the length-of-stay report lists the animals in care", async ({
  page,
}) => {
  await page.goto("/dashboard/reports/length-of-stay");
  await expect(
    content(page).getByRole("heading", { name: "Length of stay" }),
  ).toBeVisible();
  // The seed has animals in care, so a row links to one.
  const row = card(page, "Longest current stays").locator("tbody tr").first();
  await expect(row.getByRole("link")).toHaveAttribute(
    "href",
    /^\/dashboard\/animals\/[^/]+$/,
  );
  // The page draws the row's values: its days are the days from its intake
  // date to the report's today. Which stay a row shows is unit-tested
  // (app/lib/utils/length-of-stay.test.ts). The report's today is the end of
  // the default range it prints ("Jan 1 – Oct 1, 2026"), from the same
  // render, so a run across the shelter's midnight or a zone set in the
  // settings cannot split the two.
  const rangeLabel = await content(page)
    .getByText(/^[A-Z][a-z]{2} \d{1,2}(, \d{4})? – [A-Z][a-z]{2} \d{1,2}, \d{4}$/)
    .innerText();
  const reportToday = dayKeyOf(rangeLabel.split(" – ")[1]);
  // Columns: animal, species, current stay (days), cumulative, intake date.
  const cells = row.locator("td");
  const intakeDay = dayKeyOf((await cells.nth(4).innerText()).trim());
  await expect(cells.nth(2)).toHaveText(
    String(daysBetween(intakeDay, reportToday)),
  );
});
