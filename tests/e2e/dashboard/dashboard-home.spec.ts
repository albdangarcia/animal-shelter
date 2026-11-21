import { test, expect, type Page } from "@playwright/test";
import {
  APPLICANT_EMAIL,
  SEEDED_USER_PASSWORD,
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// The dashboard home's headcount cards, "Needs attention today" panel, its
// small cards (Under care, Applications waiting, Readiness) and the Longest
// stays card, read against the seed. This shows the page is wired to
// them: each renders from seeded data, and a link lands on the page where the
// work is done.
//
// What each headcount counts is covered by prisma/headcounts.test.ts, which
// also checks it agrees with the shelter board. For the attention panel and
// the Under care card, what each count counts, the uncapped counts, the order
// and the queries are covered by the database tests of the signals
// (prisma/attention-signals.test.ts, prisma/care-status.test.ts) and the unit
// tests of the summary (attention-summary.test.ts).
//
// Every role with ANIMAL_READ_ANALYTICS (volunteer, staff, admin) holds
// MEDICAL_READ, REPORTS_READ and the task and animal reads, so the staff
// tests have no "left out" card to show. The "left out" case is the whole page
// for a viewer without ANIMAL_READ_ANALYTICS: an applicant lands on /dashboard
// after sign-in and gets a welcome with links in place of every card, and no
// error. That is the last test, signed in as the applicant.
//
// Fixtures: the seed's deterministic overdue tasks (seedTasks'
// `overdueTaskSeedData`), and its open care episodes (Fido, Daisy, Rocket,
// Marigold and others). Earlier specs in a full run complete or close some of
// them, so this asserts what the page shows, not exact counts or names.

const staffState = storageStatePathFor("dashboard-home-staff.state.json");

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "staff1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: staffState,
  });
});

test.use({ storageState: staffState });

// The analytics chart's title. Its narrow-layout description repeats the text,
// so this reads the card title only.
const chartTitle = (page: Page) =>
  page
    .locator('[data-slot="card-title"]')
    .getByText("Intakes vs. Outcomes", { exact: true });

const cardIn = (page: Page, title: string) =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

test("the headcount cards say where the animals are, and In care opens the shelter board", async ({
  page,
}) => {
  await page.goto("/dashboard");

  const inCare = cardIn(page, "In care");
  await expect(inCare).toBeVisible();
  await expect(
    inCare.getByText(/^\d+ on site · \d+ in foster · \d+ not housed$/),
  ).toBeVisible();
  await expect(
    cardIn(page, "Available").getByRole("link", { name: "List available animals" }),
  ).toHaveAttribute("href", "/dashboard/animals?listingStatus=PUBLISHED");
  await expect(
    cardIn(page, "Pending adoption").getByText(/in a foster-to-adopt placement$/),
  ).toBeVisible();
  // Space: animals on site against the units' capacity (the seed has units).
  const space = cardIn(page, "Space");
  await expect(space.getByText(/^\d+ \/ \d+$/)).toBeVisible();
  await expect(
    space.getByText(/^(\d+ units? full( · \d+ over capacity)?|\d+ over capacity|Every unit has space)$/),
  ).toBeVisible();

  // The analytics chart below the cards is still there for staff.
  await expect(
    chartTitle(page),
  ).toBeVisible();

  // The old KPI cards are gone, and the new ones carry no trend.
  await expect(page.getByText("Total Animals", { exact: true })).toHaveCount(0);
  for (const title of ["In care", "Available", "Pending adoption", "Space"]) {
    await expect(
      cardIn(page, title).getByText(/this month|this period|%/),
    ).toHaveCount(0);
  }

  await inCare.getByRole("link", { name: "Open the shelter board" }).click();
  await expect(page).toHaveURL(/\/dashboard\/locations$/);
  // A seeded location on the board.
  await expect(
    page.getByRole("heading", { name: "Dog block A", exact: true }),
  ).toBeVisible();
});

test("the dashboard shows what needs attention and who is under care, and a group link opens its page", async ({
  page,
}) => {
  await page.goto("/dashboard");

  const card = (title: string) => cardIn(page, title);

  // Under care: the count by type, and the latest animals, each linking to
  // its medical record.
  const underCare = card("Under care");
  await expect(underCare).toBeVisible();
  await expect(underCare.getByText(/^\d+ animals? with an open care episode$/)).toBeVisible();
  await expect(underCare.getByText("Hospitalised in house", { exact: true })).toBeVisible();
  await expect(underCare.getByRole("link").first()).toHaveAttribute(
    "href",
    /^\/dashboard\/animals\/[^/]+\/medical$/,
  );

  // Needs attention today: the seed's overdue tasks are a group, whose link
  // opens the tasks page with open tasks, the earliest due first.
  const attention = card("Needs attention today");
  await expect(attention).toBeVisible();
  // The old Tasks/Health tabs are gone. Checked once the cards have loaded:
  // while the page still streams there are no tabs either way.
  await expect(page.getByRole("tab")).toHaveCount(0);
  const tasksDue = attention.getByRole("link", {
    name: /^\d+ tasks? due or overdue$/,
  });
  await expect(tasksDue).toBeVisible();
  await tasksDue.click();

  await expect(page).toHaveURL(
    /\/dashboard\/animal-tasks\?status=TODO(,|%2C)IN_PROGRESS&sort=dueDate\.asc$/,
  );
  // Overdue tasks lead the list.
  await expect(page.getByText(/^Overdue by /).first()).toBeVisible();
});

test("Applications waiting counts what its list shows, and a line opens the list filtered to it", async ({
  page,
}) => {
  // What counts as waiting (effective status for adoption applications, the
  // column for foster ones) and the oldest's age are covered by
  // prisma/applications-waiting.test.ts and the unit tests of the wording.
  // Here: the card renders from the seed's waiting applications, and its
  // count is the number of rows its link lists.
  await page.goto("/dashboard");

  const waiting = cardIn(page, "Applications waiting");
  await expect(waiting).toBeVisible();
  const oldest = "· oldest (\\d+ days?|submitted today)";
  await expect(
    waiting.getByRole("link", {
      name: new RegExp(`^\\d+ foster applications? ${oldest}$`),
    }),
  ).toBeVisible();
  const adoption = waiting.getByRole("link", {
    name: new RegExp(`^\\d+ adoption applications? ${oldest}$`),
  });
  await expect(adoption).toBeVisible();
  const count = Number((await adoption.textContent())!.match(/^\d+/)![0]);

  await adoption.click();
  await expect(page).toHaveURL(
    /\/dashboard\/adoption-applications\?status=PENDING(,|%2C)REVIEWING&sort=submittedAt\.asc$/,
  );
  await expect(page.getByText(`of ${count} row(s)`)).toBeVisible();
});

test("Readiness sums up the readiness board, and a group link opens that group with the same count", async ({
  page,
}) => {
  // What the card counts, which groups it picks and its wording are covered
  // by the unit tests of the summary (app/lib/readiness/summary.test.ts),
  // which read every number off the board's own builder. Here: the card
  // renders from the seed, its ready count is the board header's, and a
  // group line lands on that group's page showing the same number.
  await page.goto("/dashboard");

  const readiness = cardIn(page, "Readiness");
  await expect(readiness).toBeVisible();
  const headline = readiness.getByText(/^\d+ of \d+ animals? ready$/);
  await expect(headline).toBeVisible();
  const [, ready, total] = (await headline.textContent())!.match(
    /^(\d+) of (\d+)/,
  )!;
  await expect(
    readiness.getByText(/^(\d+|None) ready but not published$/),
  ).toBeVisible();
  // The seed's published animals are not ready (49 of 49 on a fresh seed),
  // so this line is always a link.
  await expect(
    readiness.getByRole("link", {
      name: /^\d+ published with something outstanding$/,
    }),
  ).toHaveAttribute("href", "/dashboard/readiness?stage=PUBLISHED");

  // The seed leaves nearly every animal missing an intake check, so there is
  // always a group to follow.
  // Visibly "No photo · 7"; the link's name adds "animals" for screen
  // readers.
  const groupLink = readiness
    .getByRole("listitem")
    .getByRole("link", { name: / · \d+ animals?$/ })
    .first();
  await expect(groupLink).toBeVisible();
  const [, title, count] = (await groupLink.textContent())!.match(
    /^(.+) · (\d+) animals?$/,
  )!;

  const href = (await groupLink.getAttribute("href"))!;
  expect(href).toMatch(/^\/dashboard\/readiness\?kind=[A-Z_]+$/);

  await groupLink.click();
  await expect(page).toHaveURL(new URL(href, page.url()).href);
  // The group's heading carries its count as a badge. Exact, so "Missing
  // assessments 6" can't match "Missing assessments 61".
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: `${title} ${count}`,
      exact: true,
    }),
  ).toBeVisible();
  // The board header counts the same animals as the card.
  const notReady = Number(total) - Number(ready);
  await expect(
    page.getByText(
      `${notReady} of ${total} animals not ready · ${ready} ready`,
      { exact: true },
    ),
  ).toBeVisible();
});

test("Longest stays shows the length-of-stay report's first animals and counts, and links to the report", async ({
  page,
}) => {
  // The order, what counts as in care and the 90-day line are the report's
  // own (summarizeLengthOfStay), and the card's cut and wording are covered
  // by app/lib/utils/longest-stays.test.ts. Here: the card renders from the
  // seed, and its counts and first animal are the report's.
  await page.goto("/dashboard");

  const card = cardIn(page, "Longest stays");
  await expect(card).toBeVisible();
  const summary = card.getByText(/^\d+ in care · (\d+|none) over 90 days$/);
  await expect(summary).toBeVisible();
  const [, inCare, over90] = (await summary.textContent())!.match(
    /^(\d+) in care · (\d+|none)/,
  )!;
  // The over-90 part is amber only when some animal is over, as on the
  // report's metric card.
  const over90Part = card.locator('[data-slot="card-description"] span');
  await expect(over90Part).toHaveText(/over 90 days$/);
  if (over90 === "none") {
    await expect(over90Part).not.toHaveClass(/text-amber-600/);
  } else {
    await expect(over90Part).toHaveClass(/text-amber-600/);
  }
  const rows = card.getByRole("listitem");
  await expect(rows).toHaveCount(Math.min(Number(inCare), 5));
  await expect(rows.first()).toContainText(/\d+ days?/);
  const first = rows.first().getByRole("link");
  const firstName = (await first.textContent())!;
  const firstHref = (await first.getAttribute("href"))!;
  expect(firstHref).toMatch(/^\/dashboard\/animals\/[^/]+$/);

  await card.getByRole("link", { name: "Length of stay report" }).click();
  await expect(page).toHaveURL(/\/dashboard\/reports\/length-of-stay$/);

  const metric = (label: string) =>
    page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('[data-slot="card-title"]');
  await expect(metric("Animals in care now")).toHaveText(inCare);
  await expect(metric("In care over 90 days")).toHaveText(
    over90 === "none" ? "0" : over90,
  );

  // The report's first row is the card's first animal.
  const worklist = page
    .locator('[data-slot="card"]')
    .filter({
      has: page.getByText("Longest current stays", { exact: true }),
    });
  const reportFirst = worklist
    .locator('[data-slot="table-body"]')
    .getByRole("row")
    .first()
    .getByRole("link");
  await expect(reportFirst).toHaveText(firstName);
  await expect(reportFirst).toHaveAttribute("href", firstHref);
});

test.describe("an applicant, who cannot read the shelter's analytics", () => {
  const applicantState = storageStatePathFor("dashboard-home-applicant.state.json");

  test.beforeAll(async ({ browser }) => {
    await bootstrapStorageState(browser, {
      email: APPLICANT_EMAIL,
      password: SEEDED_USER_PASSWORD,
      storageStatePath: applicantState,
    });
  });

  test.use({ storageState: applicantState });

  test("lands on /dashboard with a welcome and links, no error and none of the staff cards", async ({
    page,
  }) => {
    // Which links appear is the permission-filtered sidebar list
    // (getFilteredNavLinks). Here: the page is wired to it and to the cards'
    // own permission checks, so nothing throws.
    await page.goto("/dashboard");

    const welcome = cardIn(page, "Welcome");
    await expect(welcome).toBeVisible();
    await expect(
      welcome.getByRole("link", { name: "My Adoption Applications" }),
    ).toHaveAttribute("href", "/dashboard/my-adoption-applications");
    // The USER role's other two pages are listed, and no staff page is.
    await expect(
      welcome.getByRole("link", { name: "My Foster Application" }),
    ).toHaveAttribute("href", "/dashboard/my-foster-application");
    await expect(
      welcome.getByRole("link", { name: "My Foster Animals" }),
    ).toHaveAttribute("href", "/dashboard/my-foster-animals");
    await expect(
      welcome.getByRole("link", { name: "Animals", exact: true }),
    ).toHaveCount(0);

    await expect(page.getByText("Something Went Wrong")).toHaveCount(0);
    await expect(
      chartTitle(page),
    ).toHaveCount(0);
    for (const title of [
      "In care",
      "Needs attention today",
      "Under care",
      "Applications waiting",
      "Readiness",
      "Longest stays",
    ]) {
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toHaveCount(0);
    }

    await welcome.getByRole("link", { name: "My Adoption Applications" }).click();
    await expect(page).toHaveURL(/\/dashboard\/my-adoption-applications$/);
  });
});
