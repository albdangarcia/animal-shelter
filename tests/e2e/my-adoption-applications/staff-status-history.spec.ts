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

test("the review form says which of its two note fields the applicant sees", async ({
  page,
}) => {
  await openReviewPage(page);

  // Internal Notes had no visibility hint at all. Once the timeline ships on
  // the applicant's page, the contrast between these two fields has to be
  // obvious from the form itself.
  await expect(
    page.getByText("Staff-only. Never shown to the applicant."),
  ).toBeVisible();

  // The reason field only renders once a different status is picked. Nothing
  // is submitted here — this is about what the form promises before staff
  // commit to anything.
  await page.getByLabel("Application Status *", { exact: true }).click();
  await page.getByRole("option", { name: "Waitlisted" }).click();

  await expect(
    page.getByText(
      "Shared with the applicant — shown on their application page and recorded in the status history below.",
    ),
  ).toBeVisible();
});
