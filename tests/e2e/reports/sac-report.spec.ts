import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// The Shelter Animals Count report: picking a month on the page draws each
// SAC species' table, and the CSV carries the same month and numbers. How
// the rows are counted is unit-tested (app/lib/utils/sac-report.test.ts),
// what the query reads is database-tested (prisma/sac-report.test.ts), and
// how the file is laid out is unit-tested (app/lib/utils/report-csv.test.ts).

const adminPassword = process.env.ADMIN_PASSWORD;

const adminState = storageStatePathFor("sac-report-admin.state.json");

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the SAC report E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath: adminState,
  });
});

test.use({ storageState: adminState });

// The page's own content, below the site header, whose title is an h1 too.
const content = (page: Page) => page.locator("main > div");

// The seed's species are counted under these SAC species.
const SEEDED_CATEGORIES = [
  "Canines",
  "Felines",
  "Rabbits",
  "Small mammals",
  "Birds",
  "Reptiles and amphibians",
];

test("a picked month shows each SAC species' table, and the CSV has the same numbers", async ({
  page,
}) => {
  await page.goto("/dashboard/reports");
  await content(page)
    .getByRole("link", { name: /Shelter Animals Count/ })
    .click();
  await expect(
    content(page).getByRole("heading", { name: "Shelter Animals Count" }),
  ).toBeVisible();

  // Two months back: the seed records intakes and outcomes in recent months,
  // and the page starts on last month, so the pick has to change it.
  await content(page).getByRole("combobox", { name: "Month" }).click();
  const option = page.getByRole("option").nth(2);
  const label = (await option.innerText()).trim();
  await option.click();
  await expect(page).toHaveURL(/[?&]month=\d{4}-\d{2}/);
  const month = new URL(page.url()).searchParams.get("month");
  await expect(
    content(page).getByRole("combobox", { name: "Month" }),
  ).toHaveText(label);
  await expect(content(page).getByText(label, { exact: true }).first()).toBeVisible();

  for (const category of SEEDED_CATEGORIES) {
    const table = content(page).getByRole("table", {
      name: `${category} intakes and outcomes`,
    });
    await expect(table).toBeVisible();
    await expect(
      table.getByRole("rowheader", { name: "Transferred in from agency (out of state)" }),
    ).toBeVisible();
    await expect(
      content(page).getByRole("table", { name: `${category} animal counts` }),
    ).toBeVisible();
  }
  // Each table checks its own arithmetic, SAC's way.
  await expect(
    content(page).getByText(/^(Balanced|Doesn't balance): /),
  ).toHaveCount(SEEDED_CATEGORIES.length);

  const canines = content(page).getByRole("table", {
    name: "Canines intakes and outcomes",
  });
  const totalLiveIntakes = (
    await canines
      .getByRole("row", { name: /^Total live intakes/ })
      .getByRole("cell")
      .allInnerTexts()
  ).map((cell) => cell.trim());
  const counts = content(page).getByRole("table", {
    name: "Canines animal counts",
  });
  const ending = (
    await counts
      .getByRole("row", { name: /^Ending count/ })
      .getByRole("cell")
      .allInnerTexts()
  ).map((cell) => cell.trim());

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    content(page).getByRole("link", { name: "Download CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(
    `shelter-animals-count-${month}.csv`,
  );
  const lines = (await fs.readFile(await download.path(), "utf8"))
    .replace(/^﻿/, "")
    .split("\r\n");
  expect(lines).toContain(`Month,${label}`);
  expect(lines).toContain(`From,${month}-01`);
  expect(lines).toContain("Shelter state,NY");
  // The canine block's own totals, which come first in SAC's order.
  const canineBlock = lines.slice(lines.indexOf("Canines"));
  expect(
    canineBlock.find((line) => line.startsWith("Total live intakes,")),
  ).toBe(`Total live intakes,${totalLiveIntakes.join(",")}`);
  expect(canineBlock.find((line) => line.startsWith("Ending count,"))).toBe(
    `Ending count,${ending.join(",")}`,
  );
  expect(lines).toContain("Warnings");
});
