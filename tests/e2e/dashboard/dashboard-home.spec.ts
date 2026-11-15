import { test, expect } from "@playwright/test";
import {
  SEEDED_USER_PASSWORD,
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// The dashboard home's "Needs attention today" panel and "Under care" card,
// read against the seed. What each count counts, the uncapped counts, the
// order and the queries are covered by the database tests of the signals
// (prisma/attention-signals.test.ts, prisma/care-status.test.ts) and the unit
// tests of the summary (attention-summary.test.ts). This shows the page is
// wired to them: both render from seeded data, and a group link lands on the
// page where the work is done.
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

test("the dashboard shows what needs attention and who is under care, and a group link opens its page", async ({
  page,
}) => {
  await page.goto("/dashboard");

  const card = (title: string) =>
    page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

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
