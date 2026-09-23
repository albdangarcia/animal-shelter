import { expect, test, type Page } from "@playwright/test";
import {
  APPLICANT_NAME,
  bootstrapStorageState,
  fillStable,
  rowMenuItemHref,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

const adminPassword = process.env.ADMIN_PASSWORD;

test.describe.configure({ mode: "serial" });

const storageStatePath = storageStatePathFor(
  "staff-application-status.state.json",
);

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the staff application status E2E spec.",
    );
  }
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
});

test.use({ storageState: storageStatePath });

const APPLICATIONS_PATH = "/dashboard/adoption-applications";
const REVIEW_PATH = /^\/dashboard\/adoption-applications\/[^/]+\/review$/;

// The order a status sort puts applications in: review stages, then the two
// statuses an outcome causes.
const STATUS_ORDER = [
  "Pending",
  "Reviewing",
  "Waitlisted",
  "Approved",
  "Rejected",
  "Withdrawn",
  "Adopted",
  "Closed",
];

const janeDoeApplications = (params: Record<string, string>) =>
  `${APPLICATIONS_PATH}?${new URLSearchParams({
    query: APPLICANT_NAME,
    pageSize: "20",
    ...params,
  })}`;

// The Status column: after the row checkbox, name, email and phone.
const statusCells = (page: Page) => page.locator("tbody tr td:nth-child(5)");

const statusLabels = async (page: Page) =>
  (await statusCells(page).allTextContents()).map((text) => text.trim());

// Navigate to a table and wait for its real rows. The route's loading skeleton
// is a table too, with the same number of rows and empty cells, so a count or
// a read taken before the footer appears can be the skeleton's.
const gotoTable = async (page: Page, url: string) => {
  await page.goto(url);
  await expect(page.getByText(/of \d+ row\(s\) selected/)).toBeVisible();
};

// Jane Doe's hand-seeded fixtures cover every review status, one adoption, and
// two applications closed by an outcome, one of them on an animal since
// returned. Adopted and closed are statuses the table derives from the
// animals' outcomes, so these check the filter and the sort against that
// derivation.
test("the status filter matches what each application's outcomes make it", async ({
  page,
}) => {
  await gotoTable(page, janeDoeApplications({}));
  const all = await statusLabels(page);

  // Filtering by each status in turn splits the whole list exactly: every row
  // shows up under the status the table gives it, and under no other.
  for (const label of STATUS_ORDER) {
    await gotoTable(
      page,
      janeDoeApplications({ status: label.toUpperCase() }),
    );
    const expected = all.filter((l) => l === label);
    await expect(statusCells(page)).toHaveCount(expected.length);
    if (expected.length > 0) {
      await expect(statusCells(page)).toHaveText(expected);
    }
  }

  expect(all.filter((l) => l === "Closed")).toHaveLength(2);
  expect(all.filter((l) => l === "Adopted")).toHaveLength(1);

  await gotoTable(page, janeDoeApplications({ status: "ADOPTED,CLOSED" }));
  await expect(statusCells(page)).toHaveCount(3);
});

test("a status sort orders by review stage, then adopted and closed", async ({
  page,
}) => {
  await gotoTable(page, janeDoeApplications({}));
  const total = await statusCells(page).count();

  for (const direction of ["asc", "desc"] as const) {
    await gotoTable(
      page,
      janeDoeApplications({ sort: `status.${direction}` }),
    );
    await expect(statusCells(page)).toHaveCount(total);
    const labels = await statusLabels(page);
    const ranks = labels.map((label) => STATUS_ORDER.indexOf(label));
    expect(ranks, labels.join(", ")).not.toContain(-1);
    const sorted = [...ranks].sort((a, b) =>
      direction === "asc" ? a - b : b - a,
    );
    expect(ranks, labels.join(", ")).toEqual(sorted);
  }
});

test("a filtered list pages through every match", async ({ page }) => {
  await gotoTable(page, `${APPLICATIONS_PATH}?status=CLOSED&pageSize=10`);
  await expect(statusCells(page)).toHaveCount(10);
  const total = Number(
    (await page.getByText(/of \d+ row\(s\)/).textContent())?.match(
      /of (\d+) row/,
    )?.[1],
  );
  expect(total).toBeGreaterThan(10);

  const lastPage = Math.ceil(total / 10);
  await gotoTable(
    page,
    `${APPLICATIONS_PATH}?status=CLOSED&pageSize=10&page=${lastPage}`,
  );
  await expect(statusCells(page)).toHaveCount(total - (lastPage - 1) * 10);
  await expect(statusCells(page)).toHaveText(
    Array(total - (lastPage - 1) * 10).fill("Closed"),
  );
});

test("a closed application offers staff no status to move it to", async ({
  page,
}) => {
  await gotoTable(page, janeDoeApplications({ status: "CLOSED" }));
  await expect(statusCells(page)).toHaveCount(2);
  await page.goto(await rowMenuItemHref(page, 0, "Review"));
  await waitForPathname(page, REVIEW_PATH);

  const statusSelect = page.getByRole("combobox").first();
  await expect(statusSelect).toHaveText("Closed");
  await expect(statusSelect).toBeDisabled();
});

test("the animal's own application list derives status the same way", async ({
  page,
}) => {
  await gotoTable(page, janeDoeApplications({ status: "ADOPTED" }));
  const animalHref = await page
    .locator("tbody tr")
    .first()
    .getByRole("link")
    .last()
    .getAttribute("href");
  expect(animalHref).toMatch(/^\/dashboard\/animals\/[^/]+$/);

  await gotoTable(
    page,
    `${animalHref}/adoption-applications?${new URLSearchParams({
      query: APPLICANT_NAME,
    })}`,
  );
  await expect(statusCells(page)).toHaveText(["Adopted"]);

  // The animal has left, so nobody who applied for it is still open: each
  // application was settled already, adopted, or closed by an outcome. An
  // animal adopted, returned and adopted again has two adopted applications,
  // one per stay.
  await gotoTable(page, `${animalHref}/adoption-applications?pageSize=50`);
  const labels = await statusLabels(page);
  for (const label of labels) {
    expect(["Adopted", "Closed", "Rejected", "Withdrawn"]).toContain(label);
  }

  await gotoTable(page, `${animalHref}/adoption-applications?status=ADOPTED`);
  await expect(statusCells(page)).toHaveCount(
    labels.filter((label) => label === "Adopted").length,
  );
});

test("the animal profile opens the approved application's adoption form", async ({
  page,
}) => {
  await gotoTable(page, `${APPLICATIONS_PATH}?status=APPROVED`);
  const reviewHref = await rowMenuItemHref(page, 0, "Review");
  const applicationId = reviewHref.match(/\/adoption-applications\/([^/]+)\/review$/)?.[1];
  expect(applicationId).toBeTruthy();

  const animalHref = await page
    .locator("tbody tr")
    .first()
    .getByRole("link")
    .last()
    .getAttribute("href");
  expect(animalHref).toMatch(/^\/dashboard\/animals\/[^/]+$/);

  await gotoTable(page, `${animalHref}/adoption-applications?status=APPROVED`);
  await expect(statusCells(page)).toHaveText(["Approved"]);

  await page.goto(animalHref!);
  const completeAdoption = page.getByRole("link", { name: "Complete Adoption" });
  await expect(completeAdoption).toHaveAttribute(
    "href",
    `/dashboard/outcomes/create?applicationId=${applicationId}`,
  );
  await completeAdoption.click();
  await expect(page.getByText("Process Animal Outcome", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Outcome Type")).toBeDisabled();
  await expect(page.getByLabel("Outcome Type")).toContainText("Adoption");
});

test("an adopted animal offers re-intake instead of completing adoption again", async ({
  page,
}) => {
  await gotoTable(page, janeDoeApplications({ status: "ADOPTED" }));
  const animalHref = await page
    .locator("tbody tr")
    .first()
    .getByRole("link")
    .last()
    .getAttribute("href");
  expect(animalHref).toMatch(/^\/dashboard\/animals\/[^/]+$/);

  await page.goto(animalHref!);
  await expect(page.getByRole("link", { name: "Create Re-Intake" })).toHaveAttribute(
    "href",
    `${animalHref}/intake/create`,
  );
  await expect(page.getByRole("link", { name: "Complete Adoption" })).toHaveCount(0);
});

// The form used to submit the application's current status with every save.
// For a closed application that is a status the form schema refuses, so its
// internal notes could not be saved at all.
test("staff can save internal notes on a closed application", async ({
  page,
}) => {
  await gotoTable(page, janeDoeApplications({ status: "CLOSED" }));
  const reviewHref = await rowMenuItemHref(page, 0, "Review");
  await page.goto(reviewHref);
  await waitForPathname(page, REVIEW_PATH);

  const note = `Called about the closure ${Date.now()}`;
  await fillStable(page.getByLabel("Internal Notes", { exact: true }), note);
  await page.getByRole("button", { name: "Update Application" }).click();
  await expect(page.getByText("Application updated successfully.")).toBeVisible();

  await page.goto(reviewHref);
  await expect(page.getByLabel("Internal Notes", { exact: true })).toHaveValue(
    note,
  );
  await expect(page.getByRole("combobox").first()).toHaveText("Closed");
});

test("a person's application list derives status the same way", async ({
  page,
}) => {
  await gotoTable(page, janeDoeApplications({}));
  const all = await statusLabels(page);
  const personHref = await page
    .locator("tbody tr")
    .first()
    .getByRole("link")
    .first()
    .getAttribute("href");
  expect(personHref).toMatch(/^\/dashboard\/people-directory\/[^/]+$/);

  // Ten to a page, newest first, so the oldest applications are further on.
  const counts = { Adopted: 0, Closed: 0 };
  for (let pageNumber = 1; pageNumber <= Math.ceil(all.length / 10); pageNumber++) {
    await gotoTable(
      page,
      `${personHref}/adoption-applications?page=${pageNumber}`,
    );
    const body = page.locator("tbody");
    for (const label of ["Adopted", "Closed"] as const) {
      counts[label] += await body.getByText(label, { exact: true }).count();
    }
  }
  expect(counts).toEqual({
    Adopted: all.filter((l) => l === "Adopted").length,
    Closed: all.filter((l) => l === "Closed").length,
  });
});
