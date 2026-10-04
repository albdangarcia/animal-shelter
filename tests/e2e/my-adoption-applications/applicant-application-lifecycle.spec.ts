import { expect, test, type Page } from "@playwright/test";
import {
  APPLICANT_EMAIL,
  MY_APPLICATIONS_PATH,
  OTHER_PERSON_EMAIL,
  SEEDED_USER_PASSWORD,
  bootstrapStorageState,
  fillStable,
  rowMenuItemHref,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

// One sign-in for the whole file (see bootstrapStorageState), and serial mode:
// three of these tests mutate a fixture, and the later ones read the state the
// earlier ones leave behind.
test.describe.configure({ mode: "serial" });

const storageStatePath = storageStatePathFor(
  "applicant-adoption-applications.state.json",
);

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: APPLICANT_EMAIL,
    password: SEEDED_USER_PASSWORD,
    storageStatePath,
  });
});

test.use({ storageState: storageStatePath });

const VIEW_PATH = /^\/dashboard\/my-adoption-applications\/[^/]+$/;

// Jane Doe's twelve seeded applications, by status. Animal *names* are drawn
// from a pool and repeat across the seed, so nothing here identifies a fixture
// by name — the statuses are what `seedRegisteredUserApplicationFixtures`
// guarantees, and the list filters on exactly that. The extra PENDING and
// WITHDRAWN rows are one animal's withdrawn application and its replacement.
const FIXTURE_COUNT_BY_STATUS = {
  PENDING: 2,
  REVIEWING: 1,
  WAITLISTED: 1,
  APPROVED: 1,
  REJECTED: 1,
  WITHDRAWN: 3,
  ADOPTED: 1,
  CLOSED: 2,
} as const;

// The titles of the status messages these tests read, from
// MY_APPLICATION_STATUS_MESSAGES. That every status has its own message is a
// unit test (app/lib/utils/application-status.test.ts); these show the view
// page renders the one for the application's effective status.
const MESSAGE_TITLE_BY_STATUS = {
  PENDING: "Waiting for review",
  REVIEWING: "Under review",
  WITHDRAWN: "Withdrawn by you",
  CLOSED: "No longer available",
} as const;

type FixtureStatus = keyof typeof FIXTURE_COUNT_BY_STATUS;

// The same counts keyed by the label the Status column renders
// (`applicationStatusMeta`), which is all the table exposes.
const STATUS_LABEL: Record<FixtureStatus, string> = {
  PENDING: "Pending",
  REVIEWING: "Reviewing",
  WAITLISTED: "Waitlisted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  ADOPTED: "Adopted",
  CLOSED: "Closed",
};

const EXPECTED_TALLY = Object.fromEntries(
  Object.entries(FIXTURE_COUNT_BY_STATUS).map(([status, count]) => [
    STATUS_LABEL[status as FixtureStatus],
    count,
  ]),
);

const listByStatus = async (page: Page, status: FixtureStatus) => {
  await page.goto(`${MY_APPLICATIONS_PATH}?status=${status}&pageSize=20`);
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  return rows;
};

// The row menu is the only link to an application; the Pet Name cell links to
// the public animal page instead.
const applicationHref = (page: Page, rowIndex = 0) =>
  rowMenuItemHref(page, rowIndex, "View application");

const animalLink = (page: Page, rowIndex = 0) =>
  page.locator("tbody tr").nth(rowIndex).getByRole("link").first();

const openApplication = async (page: Page, href: string) => {
  await page.goto(href);
  await waitForPathname(page, VIEW_PATH);
};

// data-slot rather than role="alert": sonner renders its own live region, and
// this page always has exactly one status Alert.
const statusMessage = (page: Page) => page.locator('[data-slot="alert"]');

// The two CLOSED fixtures differ only in where their animal ended up, which is
// invisible from the list — so the returned one is told apart by the animal
// page itself: it was republished and offers the Adopt call to action, where
// the archived one 404s. The ordering of the two rows depends on their
// animals' real stay dates and is not something to lean on.
const findReturnedClosedFixture = async (page: Page) => {
  const rows = await listByStatus(page, "CLOSED");
  await expect(rows).toHaveCount(FIXTURE_COUNT_BY_STATUS.CLOSED);

  const candidates: { application: string; animal: string; animalName: string }[] =
    [];
  for (let i = 0; i < FIXTURE_COUNT_BY_STATUS.CLOSED; i++) {
    const link = animalLink(page, i);
    const animal = await link.getAttribute("href");
    const animalName = (await link.innerText()).trim();
    const application = await applicationHref(page, i);
    if (!animal) {
      throw new Error(`CLOSED row ${i} has no animal link.`);
    }
    candidates.push({ application, animal, animalName });
  }

  for (const candidate of candidates) {
    await page.goto(candidate.animal);

    // The archived animal is gone from the public site and renders the "Pet
    // Not Found" page (StatusPage); the returned one was republished and — a
    // CLOSED application never blocks — offers the Adopt call to action.
    const adoptCta = page.getByRole("link", { name: /^Adopt / });
    const notFoundHeading = page.getByRole("heading", {
      name: "Pet Not Found",
      exact: true,
    });

    // Wait for whichever of the two terminal states this navigation settles
    // into. `locator.count()` used here was an immediate read with no
    // auto-wait, so a page still compiling on a cold dev server read as 0
    // matches and silently misclassified the returned animal as archived.
    await expect(adoptCta.or(notFoundHeading)).toBeVisible();

    if (await adoptCta.isVisible()) {
      return candidate;
    }
  }

  throw new Error("Expected one CLOSED fixture on a republished animal.");
};

// The application submitted by the re-apply test, read straight off the top of
// the list (rows sort by submittedAt desc, and this one was submitted now).
let submittedApplicationHref: string;

test("every status is listed, and every row offers View application", async ({
  page,
}) => {
  await page.goto(`${MY_APPLICATIONS_PATH}?pageSize=20`);
  await expect(page.locator("tbody tr")).toHaveCount(
    Object.values(FIXTURE_COUNT_BY_STATUS).reduce((a, b) => a + b, 0),
  );

  // Tallied from the Status column in one pass rather than nine filtered
  // navigations: a wrong count then names the statuses that moved, which is
  // what any drift here will actually be about.
  const statusCells = await page
    .locator("tbody tr td:nth-child(4)")
    .allInnerTexts();
  const tally: Record<string, number> = {};
  for (const cell of statusCells) {
    const label = cell.trim();
    tally[label] = (tally[label] ?? 0) + 1;
  }
  expect(tally).toEqual(EXPECTED_TALLY);

  // "View application" replaced "Edit", which was gated on PENDING and was the
  // only link to an application — at the other seven statuses the applicant
  // could not reach anything they had submitted.
  await page.goto(`${MY_APPLICATIONS_PATH}?pageSize=20`);
  const viewItem = page.getByRole("menuitem", { name: "View application" });
  await expect(async () => {
    if (!(await viewItem.isVisible())) {
      await page
        .locator("tbody tr")
        .first()
        .getByRole("button", { name: "Open menu" })
        .click();
    }
    await expect(viewItem).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);

  await viewItem.click();
  await waitForPathname(page, VIEW_PATH);
  await expect(statusMessage(page)).toBeVisible();
});

test("a reviewed application is read-only, and shows why", async ({ page }) => {
  await listByStatus(page, "REVIEWING");
  const href = await applicationHref(page);
  await openApplication(page, href);

  await expect(
    page.getByRole("link", { name: "Edit application" }),
  ).toHaveCount(0);

  // The whole point of the feature: `statusChangeReason` was written by every
  // status change in the app and rendered by nothing.
  await expect(
    page.getByText("References received. Scheduling a home visit next week."),
  ).toBeVisible();
  await expect(page.getByText("by Olivia Chen").first()).toBeVisible();
  await expect(
    page.getByText("Application submitted by applicant."),
  ).toBeVisible();

  // The edit route used to render a fully editable form here and fail only on
  // submit, with a raw enum name in the message.
  await page.goto(`${href}/edit`);
  await waitForPathname(page, href);
  await expect(statusMessage(page)).toContainText(
    MESSAGE_TITLE_BY_STATUS.REVIEWING,
  );
});

test("a closed applicant can apply again once the animal is back", async ({
  page,
}) => {
  const returned = await findReturnedClosedFixture(page);

  // Same closure, same reason — the only difference is that this animal came
  // back and was republished, which is the case CLOSED exists to make
  // survivable.
  await openApplication(page, returned.application);
  await expect(statusMessage(page)).toContainText(
    MESSAGE_TITLE_BY_STATUS.CLOSED,
  );
  await expect(
    page.getByText("This animal was adopted by another applicant."),
  ).toBeVisible();

  await page.goto(returned.animal);
  await page.getByRole("link", { name: /^Adopt / }).click();
  await waitForPathname(page, `${returned.animal}/adopt`);

  // A second copy of the same form, opened while she still has no application
  // for this animal. Submitted last, once the first has gone through.
  const staleTab = await page.context().newPage();
  await staleTab.goto(`${returned.animal}/adopt`);
  await fillStable(
    staleTab.getByLabel("Reason for Adoption *", { exact: true }),
    `Submitted from a stale tab — E2E ${Date.now()}`,
  );

  // Everything but the reason prefills from her Person record and her
  // HouseholdProfile, both seeded by the fixture.
  const reason = `Ready to try again now that he is back — E2E ${Date.now()}`;
  await fillStable(
    page.getByLabel("Reason for Adoption *", { exact: true }),
    reason,
  );

  // Submitted with an address that already belongs to another person. The
  // email on this form is the contact address for this application and goes
  // nowhere near the email of record, so a taken one is not a conflict at all
  // and the application goes through untouched. Using a taken address is the
  // point: if the apply flow ever starts writing the email of record again,
  // that write collides here and this test is where it surfaces.
  await fillStable(
    page.getByLabel("Email *", { exact: true }),
    OTHER_PERSON_EMAIL,
  );

  await page.getByRole("button", { name: "Submit Application" }).click();

  await expect(
    page.getByText("Application submitted successfully."),
  ).toBeVisible();
  await waitForPathname(page, MY_APPLICATIONS_PATH);

  // Rows sort by submittedAt desc, so the application just submitted is first.
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toContainText(returned.animalName);
  submittedApplicationHref = await applicationHref(page, 0);

  await openApplication(page, submittedApplicationHref);
  await expect(statusMessage(page)).toContainText(
    MESSAGE_TITLE_BY_STATUS.PENDING,
  );
  await expect(page.getByText(reason)).toBeVisible();

  // The contested address reached the application's own snapshot — that column
  // has no unique index and is the record of what she typed, which is what a
  // reviewer reads.
  await expect(page.getByText(OTHER_PERSON_EMAIL)).toBeVisible();

  // The apply page hides the form once an application exists, but the form
  // already open in the other tab still posts to the same action — which has
  // to refuse rather than leave her with two.
  await staleTab.getByRole("button", { name: "Submit Application" }).click();
  await expect(
    staleTab.getByText("You already have an application for this animal."),
  ).toBeVisible();
  await staleTab.close();

  // With a live application again, the animal's page sends her to it rather
  // than back to the form (BLOCKING_APPLICATION_STATUSES).
  await page.goto(returned.animal);
  await expect(
    page.getByRole("link", { name: "View Your Application" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Adopt / })).toHaveCount(0);

  await page.goto(`${MY_APPLICATIONS_PATH}?pageSize=20`);
  await expect(page.locator("tbody tr")).toHaveCount(
    Object.values(FIXTURE_COUNT_BY_STATUS).reduce((a, b) => a + b, 0) + 1,
  );

  // Her own record — and the address she signs in with — keeps what it had.
  // Applying is not a way to change either one; the account page is.
  await page.goto("/dashboard/account");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    APPLICANT_EMAIL,
  );
});

test("a pending application can still be edited", async ({ page }) => {
  await openApplication(page, submittedApplicationHref);
  await page.getByRole("link", { name: "Edit application" }).click();
  await waitForPathname(page, `${submittedApplicationHref}/edit`);

  const revised = `Revised reason — E2E ${Date.now()}`;
  await fillStable(
    page.getByLabel("Reason for Adoption *", { exact: true }),
    revised,
  );
  await page.getByRole("button", { name: "Update Application" }).click();

  await expect(
    page.getByText("Application updated successfully."),
  ).toBeVisible();
  await waitForPathname(page, MY_APPLICATIONS_PATH);

  await openApplication(page, submittedApplicationHref);
  await expect(page.getByText(revised)).toBeVisible();
});

test("withdrawing asks first, and closes the edit route", async ({ page }) => {
  await openApplication(page, submittedApplicationHref);

  await page.getByRole("button", { name: "Withdraw application" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Withdraw your application?");
  // Not the APPROVED copy: nothing is being held for her at PENDING.
  await expect(dialog).not.toContainText("back to the adoptable listings");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(statusMessage(page)).toContainText(
    MESSAGE_TITLE_BY_STATUS.PENDING,
  );
  await expect(
    page.getByRole("link", { name: "Edit application" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Withdraw application" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Withdraw", exact: true })
    .click();

  await expect(
    page.getByText("Application withdrawn successfully."),
  ).toBeVisible();
  await expect(statusMessage(page)).toContainText(
    MESSAGE_TITLE_BY_STATUS.WITHDRAWN,
  );
  await expect(
    page.getByText("Application withdrawn by user."),
  ).toBeVisible();

  // The status change she just made herself closes the form off.
  await page.goto(`${submittedApplicationHref}/edit`);
  await waitForPathname(page, submittedApplicationHref);
  await expect(
    page.getByRole("link", { name: "Edit application" }),
  ).toHaveCount(0);
});

test("reactivating puts a withdrawn application back to pending", async ({
  page,
}) => {
  await openApplication(page, submittedApplicationHref);
  await page.getByRole("button", { name: "Reactivate" }).click();

  await expect(
    page.getByText("Application reactivated successfully."),
  ).toBeVisible();
  await expect(statusMessage(page)).toContainText(
    MESSAGE_TITLE_BY_STATUS.PENDING,
  );
  await expect(
    page.getByText("Application reactivated by user."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit application" }),
  ).toBeVisible();
});

// The enabled case is the reactivation above.
test("reactivate is disabled, with the reason, once the animal has left", async ({
  page,
}) => {
  const rows = await listByStatus(page, "WITHDRAWN");
  await expect(rows).toHaveCount(FIXTURE_COUNT_BY_STATUS.WITHDRAWN);

  const hrefs: string[] = [];
  for (let i = 0; i < FIXTURE_COUNT_BY_STATUS.WITHDRAWN; i++) {
    hrefs.push(await applicationHref(page, i));
  }

  // One of the three sits on an archived animal; the order of the rows is not
  // something to lean on, so each is opened until it turns up.
  let disabled = false;
  for (const href of hrefs) {
    await openApplication(page, href);
    const reactivate = page.getByRole("button", { name: "Reactivate" });
    await expect(reactivate).toBeVisible();
    if (await reactivate.isDisabled()) {
      disabled = true;
      break;
    }
  }
  expect(disabled, "a WITHDRAWN fixture on an archived animal").toBe(true);

  // The action refuses unless the animal is still PUBLISHED; offered blindly
  // it could only ever produce an error toast.
  await expect(
    page.getByText(
      /has left the shelter, so this application can no longer be reactivated/,
    ),
  ).toBeVisible();
});

// Staff took a walk-in application, it was withdrawn, and they later took a
// fresh one for the same animal. Both reach "My Applications" when the person
// signs up, and reactivating the withdrawn one would leave two live
// applications for the animal.
test("a withdrawn application cannot be reactivated beside a live replacement", async ({
  page,
}) => {
  const pendingRows = await listByStatus(page, "PENDING");
  const pendingAnimals = new Set<string | null>();
  for (let i = 0; i < (await pendingRows.count()); i++) {
    pendingAnimals.add(await animalLink(page, i).getAttribute("href"));
  }

  const withdrawnRows = await listByStatus(page, "WITHDRAWN");
  const blocked: number[] = [];
  for (let i = 0; i < (await withdrawnRows.count()); i++) {
    if (pendingAnimals.has(await animalLink(page, i).getAttribute("href"))) {
      blocked.push(i);
    }
  }
  // Exactly the hand-over pair: the other withdrawn rows sit on animals with
  // nothing else pending.
  expect(blocked).toHaveLength(1);
  const href = await applicationHref(page, blocked[0]);

  await openApplication(page, href);
  await page.getByRole("button", { name: "Reactivate" }).click();

  await expect(
    page.getByText(
      "Cannot reactivate application. You already have an active application for this animal.",
    ),
  ).toBeVisible();
  await expect(statusMessage(page)).toContainText(
    MESSAGE_TITLE_BY_STATUS.WITHDRAWN,
  );
});

// The release itself is a database test (prisma/application-withdrawal.test.ts).
test("withdrawing an approved application says the animal goes back on the listings", async ({
  page,
}) => {
  await listByStatus(page, "APPROVED");
  const animal = await animalLink(page).getAttribute("href");
  const href = await applicationHref(page);
  if (!animal) {
    throw new Error("APPROVED row has no animal link.");
  }

  // Approval holds the animal at PENDING_ADOPTION, and its page offers no way
  // to apply while it is held.
  await page.goto(animal);
  await expect(
    page.getByText("Pending Adoption", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Adopt / })).toHaveCount(0);

  await openApplication(page, href);
  await page.getByRole("button", { name: "Withdraw application" }).click();
  const dialog = page.getByRole("alertdialog");
  // The consequence the dialog exists to name.
  await expect(dialog).toContainText("back to the adoptable listings");
  await dialog.getByRole("button", { name: "Withdraw", exact: true }).click();

  await expect(
    page.getByText("Application withdrawn successfully."),
  ).toBeVisible();
  await expect(statusMessage(page)).toContainText(
    MESSAGE_TITLE_BY_STATUS.WITHDRAWN,
  );
});
