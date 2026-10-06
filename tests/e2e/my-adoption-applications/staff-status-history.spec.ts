import { expect, test, type Page } from "@playwright/test";
import {
  APPLICANT_NAME,
  bootstrapStorageState,
  rowMenuItemHref,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

const adminPassword = process.env.ADMIN_PASSWORD;

test.describe.configure({ mode: "serial" });

const storageStatePath = storageStatePathFor(
  "staff-adoption-status-history.state.json",
);

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the staff status-history E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

test.use({ storageState: storageStatePath });

const REVIEW_PATH = /^\/dashboard\/adoption-applications\/[^/]+\/review$/;

// Jane Doe's REVIEWING fixture, which has the fullest seeded trail: a
// submission, a staff transition, and a written reason. The staff list filters
// on applicant name and status, and `seedRegisteredUserApplicationFixtures`
// guarantees she holds exactly one application at each — no fixture is
// identified by animal name, which the seed draws from a pool.
const openReviewPage = async (page: Page) => {
  await page.goto(
    `/dashboard/adoption-applications?query=${encodeURIComponent(
      APPLICANT_NAME,
    )}&status=REVIEWING`,
  );
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const href = await rowMenuItemHref(page, 0, "Review");
  await page.goto(href);
  await waitForPathname(page, REVIEW_PATH);
};

test("the staff review page renders the application's status history", async ({
  page,
}) => {
  await openReviewPage(page);

  await expect(page.getByText("Status History")).toBeVisible();

  // Both ends of the trail, and the staff member who wrote the transition.
  // Every adoption action in this app has always written these rows; until
  // this feature nothing rendered them, on either side.
  await expect(
    page.getByText("Application submitted by applicant."),
  ).toBeVisible();
  await expect(
    page.getByText("References received. Scheduling a home visit next week."),
  ).toBeVisible();
  await expect(page.getByText("by Olivia Chen").first()).toBeVisible();
});

test("the review form marks the reason required only when needed, and says which note the applicant sees", async ({
  page,
}) => {
  // One of Jane Doe's PENDING fixtures. There can be more than one (a withdrawn
  // application's replacement is PENDING too), and any of them will do:
  // nothing is submitted.
  await page.goto(
    `/dashboard/adoption-applications?query=${encodeURIComponent(
      APPLICANT_NAME,
    )}&status=PENDING`,
  );
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.goto(await rowMenuItemHref(page, 0, "Review"));
  await waitForPathname(page, REVIEW_PATH);

  const status = page.getByLabel("Application Status", { exact: true });
  const optionalReason = page.getByLabel("Reason for Status Change", {
    exact: true,
  });
  const requiredReason = page.getByLabel("Reason for Status Change *", {
    exact: true,
  });

  // Unchanged: no reason is asked for, so the field does not render at all.
  await expect(status).toHaveText("Pending");
  await expect(optionalReason).toHaveCount(0);
  await expect(requiredReason).toHaveCount(0);

  // Internal Notes had no visibility hint at all. Once the timeline ships on
  // the applicant's page, the contrast between these two fields has to be
  // obvious from the form itself: this hint now, the reason field's below.
  await expect(
    page.getByText("Staff-only. Never shown to the applicant."),
  ).toBeVisible();

  await status.click();
  await page.getByRole("option", { name: "Rejected", exact: true }).click();
  await expect(requiredReason).toBeVisible();
  await expect(optionalReason).toHaveCount(0);
  await expect(
    page.getByText(
      "Shared with the applicant — shown on their application page and recorded in the status history below.",
    ),
  ).toBeVisible();

  // Picking a new application up for review is the one change the server lets
  // through without a reason.
  await status.click();
  await page.getByRole("option", { name: "Reviewing", exact: true }).click();
  await expect(optionalReason).toBeVisible();
  await expect(requiredReason).toHaveCount(0);
});
