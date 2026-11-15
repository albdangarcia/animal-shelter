import { test, expect, type Page } from "@playwright/test";
import {
  SEEDED_USER_PASSWORD,
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// The dashboard home's headcount cards, "Needs attention today" panel and
// "Under care" card, read against the seed. This shows the page is wired to
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
// Every role that sees the dashboard (volunteer, staff, admin) holds
// MEDICAL_READ and the task and animal reads, so there is no "left out"
// case to show.
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
