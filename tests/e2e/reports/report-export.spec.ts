import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// A report's CSV download and its printout. How each report is laid out as
// CSV, and how a cell is quoted, is unit-tested (app/lib/utils/report-csv.test.ts).
// Who may download one, and how the route reads its filters, is unit-tested
// (app/api/reports/[report]/report-csv-handler.test.ts). This shows that the
// link carries the page's period and species to the route, that the file has
// the page's numbers, and that a printout is the report alone.

const adminPassword = process.env.ADMIN_PASSWORD;

const adminState = storageStatePathFor("report-export-admin.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the report export E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath: adminState,
  });
});

// The page's own content, below the site header, whose title is an h1 too.
const content = (page: Page) => page.locator("main > div");

// The value on one of the report's figure cards, e.g. "88.7%".
const figure = (page: Page, label: string) =>
  content(page)
    .locator('[data-slot="card"]')
    .filter({ hasText: label })
    .last()
    .locator('[data-slot="card-title"]');

const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

test.describe("staff who read the reports", () => {
  test.use({ storageState: adminState });

  test("the outcomes CSV has the page's period, species and numbers", async ({
    page,
  }) => {
    // The widest range the report takes, so seeded outcomes fall inside it
    // on any day. The runner's day stands in for the shelter's: the file is
    // checked against the page, not against this day.
    const today = new Date().toISOString().slice(0, 10);
    const from = shiftDay(today, -730);
    await page.goto(`/dashboard/reports/outcomes?from=${from}&to=${today}`);

    // Pick a species with the page's own filter, so the link has to follow
    // a change the page made.
    await content(page).getByRole("button", { name: "Species" }).click();
    await page.getByRole("option", { name: "Cat", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/[?&]species=/);
    await expect(
      content(page).getByRole("link", { name: "Download CSV" }),
    ).toHaveAttribute("href", /^\/api\/reports\/outcomes\?.*species=/);

    const rate = (await figure(page, "Live release rate").innerText()).trim();
    const total = (await figure(page, "Total outcomes").innerText()).trim();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      content(page).getByRole("link", { name: "Download CSV" }).click(),
    ]);
    // The period's end is the shelter's today, which can be a day off the
    // runner's; the start is the one the URL set.
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^outcome-statistics-${from}-to-\\d{4}-\\d{2}-\\d{2}\\.csv$`),
    );
    const csv = await fs.readFile(await download.path(), "utf8");
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines).toContain(`From,${from}`);
    expect(lines).toContain("Species,Cat");
    expect(lines).toContain(`Live release rate,${rate}`);
    expect(lines).toContain(`Total outcomes,${total}`);
  });

  test("a printed report is the report alone, in light colours", async ({
    page,
  }) => {
    await page.goto("/dashboard/reports/outcomes");
    await expect(
      content(page).getByRole("heading", { name: "Outcome statistics" }),
    ).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(page.locator('[data-slot="sidebar"]').first()).toBeHidden();
    // The site header keeps its title, the only title many pages have, and
    // loses its controls.
    const header = page.locator("header").first();
    await expect(header.getByRole("heading", { name: "Reports" })).toBeVisible();
    // The header has buttons (the sidebar toggle at least), and none shows.
    expect(
      await header.getByRole("button", { includeHidden: true }).count(),
    ).toBeGreaterThan(0);
    await expect(header.getByRole("button")).toHaveCount(0);
    await expect(
      content(page).getByRole("link", { name: "Download CSV" }),
    ).toBeHidden();
    await expect(
      content(page).getByRole("button", { name: "Species" }),
    ).toBeHidden();
    // The filters are gone, so the page says which species it counts.
    await expect(content(page).getByText("· All species")).toBeVisible();
    await expect(figure(page, "Live release rate")).toBeVisible();

    // Dark mode stays on screen: the page prints on the light background,
    // with a light colour scheme, as the theme switch would set them.
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    });
    const read = () =>
      page.evaluate(() => ({
        background: getComputedStyle(document.body).backgroundColor,
        scheme: getComputedStyle(document.documentElement).colorScheme,
      }));
    const printed = await read();
    await page.emulateMedia({ media: "screen" });
    const onScreen = await read();
    expect(printed.background).not.toBe(onScreen.background);
    expect(printed.scheme).toBe("light");
    expect(onScreen.scheme).toBe("dark");
  });
});
