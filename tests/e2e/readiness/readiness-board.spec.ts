import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  APPLICANT_EMAIL,
  SEEDED_USER_PASSWORD,
  bootstrapStorageState,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// The shelter-wide readiness board, read against the seed alone. Earlier
// specs in a full run change other named animals (Frisco is given an
// outcome, Daisy's deleted intro is restored, Buddy's and Rocket's traits are
// edited), so every fixture asserted here is one nothing else touches
// (prisma/seed.ts, the assessments and readiness tails):
// - Fido: an escalated Daily Rounds two days ago.
// - Flash: a hand-assigned "Good with other dogs" his "Solo-dog home" intro
//   contradicts.
// - Leo: an unplaced draft cat with no photo; he has an Intake Medical but no
//   Intake Behavioral.

const adminPassword = process.env.ADMIN_PASSWORD;
const BOARD_PATH = "/dashboard/readiness";

const adminState = storageStatePathFor("readiness-board-admin.state.json");
const applicantState = storageStatePathFor(
  "readiness-board-applicant.state.json",
);

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the readiness board E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath: adminState,
  });
  await bootstrapStorageState(browser, {
    email: APPLICANT_EMAIL,
    password: SEEDED_USER_PASSWORD,
    storageStatePath: applicantState,
  });
});

test.use({ storageState: adminState });

const group = (page: Page, title: string) =>
  page.getByRole("region", { name: new RegExp(`^${title}`) });

const rowFor = (page: Page, title: string, animal: string) =>
  group(page, title)
    .locator("tbody tr")
    .filter({ has: page.getByRole("link", { name: animal, exact: true }) });

// Each row's "blocked since" instant, top to bottom; null for an undated row.
const sinceDates = (region: Locator) =>
  region
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map(
        (row) => row.querySelector("time")?.getAttribute("datetime") ?? null,
      ),
    );

// Text of one column, every row.
const column = (page: Page, nth: number) =>
  page.locator(`section tbody tr td:nth-child(${nth})`);

test("groups the seeded blockers by kind", async ({ page }) => {
  await page.goto(BOARD_PATH);
  await expect(
    page.getByRole("heading", { level: 1, name: "Readiness Board" }),
  ).toBeVisible();

  await expect(rowFor(page, "Escalated findings", "Fido")).toContainText(
    "Daily Rounds of",
  );
  await expect(
    rowFor(page, "Unsupported characteristics", "Flash"),
  ).toContainText("Good with other dogs — contradicted by a live finding");
  await expect(rowFor(page, "No photo", "Leo")).toContainText(
    "No photo on the profile",
  );
});

test("within each group the longest-blocked animal comes first", async ({
  page,
}) => {
  await page.goto(BOARD_PATH);
  await expect(rowFor(page, "Escalated findings", "Fido")).toBeVisible();

  const sections = page.locator("section[aria-labelledby]");
  const count = await sections.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const dates = await sinceDates(sections.nth(i));
    const dated = dates.filter((d): d is string => d !== null);
    // Undated rows only ever trail the dated ones.
    expect(dates.slice(0, dated.length)).toEqual(dated);
    const times = dated.map((d) => new Date(d).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  }
});

test("each row links to what clears it", async ({ page }) => {
  // The Missing assessments group runs to dozens of rows, so Leo (32 days
  // blocked) doesn't make its overview preview of the 5 longest-blocked —
  // narrow with species + stage, the way a manager actually would, to reach
  // him directly.
  await page.goto(
    `${BOARD_PATH}?kind=MISSING_ASSESSMENT&species=Cat&stage=DRAFT`,
  );
  await rowFor(page, "Missing assessments", "Leo")
    .getByRole("link", { name: "Record Intake Behavioral" })
    .click();
  await waitForPathname(page, /\/dashboard\/animals\/[^/]+\/assessments\/create$/);
  expect(new URL(page.url()).searchParams.get("template")).toBe("INTAKE_BEHAVIORAL");
  // The form starts on Intake Behavioral, not the first template in the list.
  await expect(page.locator("#template-picker")).toHaveText("Intake Behavioral");
  await expect(page.getByLabel("Kennel presence *", { exact: true })).toBeVisible();

  await page.goto(BOARD_PATH);
  await rowFor(page, "Escalated findings", "Fido")
    .getByRole("link", { name: "Review the Daily Rounds" })
    .click();
  await waitForPathname(page, /\/dashboard\/animals\/[^/]+\/assessments\/[^/]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Daily Rounds" }),
  ).toBeVisible();

  await page.goto(BOARD_PATH);
  await rowFor(page, "Unsupported characteristics", "Flash")
    .getByRole("link", { name: "Review characteristics" })
    .click();
  await waitForPathname(page, /\/dashboard\/animals\/[^/]+\/characteristics$/);
  await expect(
    page.getByText(/^Contradicted by “Recommendation”: Solo-dog home/),
  ).toBeVisible();

  await page.goto(BOARD_PATH);
  await rowFor(page, "No photo", "Leo")
    .getByRole("link", { name: "Add a photo" })
    .click();
  await waitForPathname(page, /\/dashboard\/animals\/[^/]+\/photos$/);
});

test("drills into a group's full list and paginates it", async ({ page }) => {
  await page.goto(BOARD_PATH);

  const missingOverview = group(page, "Missing assessments");
  const showAll = missingOverview.getByRole("link", { name: /^Show all \d+/ });
  const total = Number((await showAll.textContent())?.match(/\d+/)?.[0]);
  // The seed leaves nearly every animal missing at least one intake check,
  // so this group is always well past the 5-row preview.
  expect(total).toBeGreaterThan(5);

  await showAll.click();
  await page.waitForURL(
    (url) => url.searchParams.get("kind") === "MISSING_ASSESSMENT",
  );
  await expect(
    page.getByRole("heading", { level: 2, name: /^Missing assessments/ }),
  ).toBeVisible();
  // Leaving the overview behind: no other group renders on a kind page.
  await expect(group(page, "Escalated findings")).toHaveCount(0);

  const pageSize = 10;
  const rows = page.locator("section tbody tr");
  await expect(rows).toHaveCount(Math.min(total, pageSize));

  if (total > pageSize) {
    const firstAnimalPage1 = await rows.first().locator("a").first().textContent();

    await page.getByRole("link", { name: "Go to next page" }).click();
    await page.waitForURL((url) => url.searchParams.get("page") === "2");
    await expect(rows).toHaveCount(Math.min(total - pageSize, pageSize));

    const firstAnimalPage2 = await rows.first().locator("a").first().textContent();
    expect(firstAnimalPage2).not.toBe(firstAnimalPage1);
  }

  await page.getByRole("link", { name: "All groups" }).click();
  await waitForPathname(page, BOARD_PATH);
  await expect(
    page.getByRole("heading", { level: 1, name: "Readiness Board" }),
  ).toBeVisible();
  await expect(group(page, "Missing assessments")).toBeVisible();
});

test("filters by species, location and stage", async ({ page }) => {
  await page.goto(BOARD_PATH);
  await expect(rowFor(page, "Escalated findings", "Fido")).toBeVisible();

  await page.getByRole("button", { name: "Species", exact: true }).click();
  await page.getByRole("option", { name: "Cat", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("species") === "Cat");
  await page.keyboard.press("Escape");

  await expect(rowFor(page, "No photo", "Leo")).toBeVisible();
  // The species line under each animal's name.
  const species = await page
    .locator("section tbody tr td:first-child div")
    .allTextContents();
  expect(new Set(species)).toEqual(new Set(["Cat"]));
  await expect(group(page, "Escalated findings")).toHaveCount(0);

  await page.getByRole("button", { name: "Reset" }).click();
  await waitForPathname(page, BOARD_PATH);
  await expect(rowFor(page, "Escalated findings", "Fido")).toBeVisible();

  // Leo is an unplaced draft.
  for (const [query, nth, expected] of [
    ["location=unplaced", 2, "Unplaced"],
    ["stage=DRAFT", 3, "Draft"],
  ] as const) {
    await page.goto(`${BOARD_PATH}?${query}`);
    await expect(rowFor(page, "No photo", "Leo")).toBeVisible();
    expect(new Set(await column(page, nth).allTextContents())).toEqual(
      new Set([expected]),
    );
  }
});

test("the sidebar entry leads to the board", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Readiness Board" }).click();
  await waitForPathname(page, BOARD_PATH);
  await expect(
    page.getByRole("heading", { level: 1, name: "Readiness Board" }),
  ).toBeVisible();
});

test("an account without assessment access neither sees nor opens it", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: applicantState });
  const page = await context.newPage();

  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: "My Adoption Applications" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Readiness Board" }),
  ).toHaveCount(0);

  await page.goto(BOARD_PATH);
  await expect(
    page.getByRole("heading", { name: "Access Denied" }),
  ).toBeVisible();

  await context.close();
});
