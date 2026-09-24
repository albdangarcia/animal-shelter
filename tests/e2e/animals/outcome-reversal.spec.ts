import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  bootstrapStorageState,
  fillStable,
  rowMenuItemHref,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
  waitForPathname,
} from "../support/applications";

const adminPassword = process.env.ADMIN_PASSWORD;

test.describe.configure({ mode: "serial" });

const storageStatePath = storageStatePathFor("outcome-reversal.state.json");
const volunteerStatePath = storageStatePathFor(
  "outcome-reversal-volunteer.state.json",
);

test.beforeAll(async ({ browser }) => {
  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD must be available to run the outcome reversal E2E spec.",
    );
  }
  // Reversal is held by admins only, so the whole file runs as one.
  await bootstrapStorageState(browser, {
    email: "admin@example.com",
    password: adminPassword,
    storageStatePath,
  });
  await bootstrapStorageState(browser, {
    email: "volunteer1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: volunteerStatePath,
  });
});

test.use({ storageState: storageStatePath });

const OPEN_STATUSES = ["Pending", "Reviewing", "Waitlisted", "Approved"];

// The seed's hand-written applicants, whose applications other specs assert
// on one by one. An adoption here would close theirs, so their animals are
// left alone.
const FIXTURE_APPLICANTS = [
  "Jane Doe",
  "John Smith",
  "Pat Mislinked",
  "Casey Deactivated",
  "Casey Reapply",
];
// Every other spec and support file, read as text. An animal or person they
// name is one some spec relies on (a readiness fixture, an in-care animal an
// outcome is recorded against), and this spec archives its animal and files
// an application for its applicant, so both are chosen from those no other
// spec mentions. Read rather than listed, so a new spec is covered without
// anyone remembering to update this one.
const E2E_DIR = path.resolve(__dirname, "..");
const OTHER_SOURCES = (fs.readdirSync(E2E_DIR, { recursive: true }) as string[])
  .filter(
    (file) =>
      file.endsWith(".ts") && path.basename(file) !== path.basename(__filename),
  )
  .map((file) => fs.readFileSync(path.join(E2E_DIR, file), "utf8"))
  .join("\n");
// A whole-word match. `\b` counts only ASCII letters as word characters, so
// an accented name would never match it; the boundaries here are any letter
// or digit in any script. A name only assembled at runtime is out of reach of
// a text scan. Specs that take whichever animal comes first (the first
// published one, say) do not depend on which one it is, so archiving one
// only moves their pick along.
const isNamedElsewhere = (name: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`,
    "u",
  ).test(OTHER_SOURCES);

const OUTCOMES_PATH = "/dashboard/outcomes";

// The route's loading skeleton is a table too, so wait for the real footer
// before reading rows.
const gotoTable = async (page: Page, url: string) => {
  await page.goto(url);
  await expect(page.getByText(/of \d+ row\(s\) selected/)).toBeVisible();
};

interface Candidate {
  animalId: string;
  winnerReviewHref: string;
  // Every other open application on the animal, with the status it shows
  // before any outcome is recorded.
  others: { reviewHref: string; status: string }[];
}

// Reads every page of a table at 50 rows a page, one value per row. The
// reader runs in the browser, so it can use nothing from this file.
const readAllPages = async (
  page: Page,
  url: string,
  readRows: (rows: Element[]) => string[],
) => {
  const values: string[] = [];
  for (let pageNumber = 1; ; pageNumber++) {
    await gotoTable(page, `${url}&pageSize=50&page=${pageNumber}`);
    const rows = await page.locator("tbody tr").evaluateAll(readRows);
    values.push(...rows);
    if (rows.length < 50) return values;
  }
};

// Radix SelectTrigger renders role="combobox"; the shadcn Form wiring gives
// the FormField-backed ones a real label association.
const chooseFromSelect = async (page: Page, label: string, option: string) => {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
};

// The yard and children radio labels are plain <div>s, not associated with
// their group, and there are two Yes/No pairs on the staff application form.
const radioByGroupLabel = (page: Page, label: string, option: "Yes" | "No") =>
  page
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .filter({ has: page.getByRole("radio") })
    .last()
    .getByRole("radio", { name: option });

/**
 * Sets up an animal for an adoption to be recorded, reversed and recorded
 * again: a published animal with open applications, plus one more, filed and
 * approved here, to be the winner. The ones already there are the
 * applications the adoption closes.
 *
 * The seed's applicant pools are random, so the animal is found rather than
 * named. Animals with an open application from a hand-written fixture
 * applicant, or from anyone another spec names, are passed over, and so is
 * any animal another spec names.
 */
const prepareCandidate = async (page: Page): Promise<Candidate> => {
  // Each published animal's link and name.
  const publishedNames = new Map(
    (
      await readAllPages(
        page,
        "/dashboard/animals?listingStatus=PUBLISHED",
        (rows) =>
          rows.map((row) => {
            const link = row.querySelector("a");
            return `${link?.getAttribute("href") ?? ""}\t${link?.textContent?.trim() ?? ""}`;
          }),
      )
    ).map((entry) => entry.split("\t") as [string, string]),
  );

  // Each open application's animal, applicant, and applicant's record.
  const openApplications = (
    await readAllPages(
      page,
      "/dashboard/adoption-applications?status=PENDING,REVIEWING,WAITLISTED,APPROVED",
      (rows) =>
        rows.map((row) => {
          const links = row.querySelectorAll("a");
          return [
            links[links.length - 1]?.getAttribute("href") ?? "",
            links[0]?.textContent?.trim() ?? "",
            links[0]?.getAttribute("href") ?? "",
          ].join("\t");
        }),
    )
  ).map((entry) => {
    const [animalHref, applicant, personHref] = entry.split("\t");
    return { animalHref, applicant, personHref };
  });

  const passedOver = new Set(
    openApplications
      .filter(
        ({ applicant }) =>
          FIXTURE_APPLICANTS.includes(applicant) || isNamedElsewhere(applicant),
      )
      .map(({ animalHref }) => animalHref),
  );
  const animalHref = [
    ...new Set(openApplications.map(({ animalHref }) => animalHref)),
  ].find(
    (href) =>
      publishedNames.has(href) &&
      !passedOver.has(href) &&
      !isNamedElsewhere(publishedNames.get(href)!),
  );
  if (!animalHref) {
    throw new Error(
      "No published animal has open applications only from random-pool applicants no other spec names, and is not named by another spec itself.",
    );
  }
  const animalId = animalHref.split("/").pop() as string;
  const animalName = publishedNames.get(animalHref)!;

  // The winner's applicant: someone from the random pools with no
  // application on this animal, since one person cannot hold two.
  const onThisAnimal = new Set(
    openApplications
      .filter((entry) => entry.animalHref === animalHref)
      .map(({ personHref }) => personHref),
  );
  const applicant = openApplications.find(
    ({ applicant, personHref }) =>
      !FIXTURE_APPLICANTS.includes(applicant) &&
      !isNamedElsewhere(applicant) &&
      !onThisAnimal.has(personHref),
  );
  if (!applicant) throw new Error("No applicant is free to apply.");
  const personId = applicant.personHref.split("/").pop() as string;

  const applicationsPath = `${animalHref}/adoption-applications`;
  await page.goto(
    `/dashboard/adoption-applications/new?personId=${personId}&returnTo=${encodeURIComponent(applicationsPath)}`,
  );
  // The animal picker searches by name and several seeded animals share
  // one, so the option is picked by id: its value is the animal's id.
  await page
    .getByRole("combobox")
    .filter({ hasText: "Search for an animal" })
    .click();
  await page.getByPlaceholder("Type an animal name...").fill(animalName);
  const option = page.locator(`[cmdk-item][data-value="${animalId}"]`);
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();

  // Contact fields prefill from the person's record, which does not always
  // carry every one; the email is unique so the row can be found below.
  const email = `outcome-reversal-e2e-${Date.now()}@example.com`;
  await fillStable(page.getByLabel("Email *", { exact: true }), email);
  await fillStable(page.getByLabel("Phone *", { exact: true }), "212-555-0142");
  await fillStable(
    page.getByLabel("Address Line 1 *", { exact: true }),
    "8 Test Lane",
  );
  await fillStable(page.getByLabel("City *", { exact: true }), "New York");
  await fillStable(page.getByLabel("ZIP Code *", { exact: true }), "10001");
  await chooseFromSelect(page, "State *", "New York");
  await chooseFromSelect(page, "Living Situation *", "Own Home");
  await fillStable(page.getByLabel("Household Size *", { exact: true }), "2");
  await radioByGroupLabel(page, "Do they have a yard? *", "No").click();
  await radioByGroupLabel(
    page,
    "Are there children in the home? *",
    "No",
  ).click();
  await fillStable(
    page.getByLabel("Animal Experience *", { exact: true }),
    "Has had dogs and cats.",
  );
  await fillStable(
    page.getByLabel("Reason for Adoption *", { exact: true }),
    "Outcome reversal coverage.",
  );
  await page.getByRole("button", { name: "Submit Application" }).click();
  await expect(
    page.getByText("Application submitted successfully."),
  ).toBeVisible();
  await waitForPathname(page, applicationsPath);

  // Every open application on the animal, the new one among them.
  await gotoTable(page, `${applicationsPath}?pageSize=50`);
  const rows = await page
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => [
        row.querySelector("td:nth-child(5)")?.textContent?.trim() ?? "",
        row.textContent ?? "",
      ]),
    );
  const open = [];
  for (const [index, [status, text]] of rows.entries()) {
    if (!OPEN_STATUSES.includes(status)) continue;
    open.push({
      reviewHref: await rowMenuItemHref(page, index, "Review"),
      status,
      isWinner: text.includes(email),
    });
  }
  const winner = open.find(({ isWinner }) => isWinner);
  if (!winner) throw new Error("The new application is not on the list.");

  await page.goto(winner.reviewHref);
  await chooseFromSelect(page, "Application Status *", "Approved");
  await fillStable(
    page.getByLabel("Reason for Status Change *", { exact: true }),
    "Approved ahead of recording the adoption.",
  );
  await page.getByRole("button", { name: "Update Application" }).click();
  await expect(
    page.getByText("Application updated successfully."),
  ).toBeVisible();

  return {
    animalId,
    winnerReviewHref: winner.reviewHref,
    others: open
      .filter(({ isWinner }) => !isWinner)
      .map(({ reviewHref, status }) => ({ reviewHref, status })),
  };
};

// The review page's status select shows the application's effective status.
const expectReviewStatus = async (
  page: Page,
  reviewHref: string,
  status: string,
) => {
  await page.goto(reviewHref);
  await expect(page.getByRole("combobox").first()).toHaveText(status);
};

const expectStatuses = async (
  page: Page,
  candidate: Candidate,
  winner: string,
  others: "Closed" | "as before",
) => {
  await expectReviewStatus(page, candidate.winnerReviewHref, winner);
  for (const other of candidate.others) {
    await expectReviewStatus(
      page,
      other.reviewHref,
      others === "Closed" ? "Closed" : other.status,
    );
  }
};

// The outcome report's adoption count over its default range, the year to
// date, which takes in an adoption recorded today.
const reportedAdoptions = async (page: Page) => {
  await page.goto("/dashboard/reports/outcomes");
  await expect(
    page.getByRole("heading", { name: "Outcome statistics" }),
  ).toBeVisible();
  const row = page
    .locator("tbody tr")
    .filter({ has: page.getByRole("cell", { name: "Adoption", exact: true }) });
  if ((await row.count()) === 0) return 0;
  return Number((await row.locator("td").nth(1).innerText()).trim());
};

// Records the adoption from the winner's review page, the way staff do.
const recordAdoption = async (page: Page, candidate: Candidate) => {
  await page.goto(candidate.winnerReviewHref);
  await page.getByRole("link", { name: "Create Outcome" }).click();
  await page.getByRole("button", { name: "Process Outcome" }).click();
  await expect(page.getByText("Outcome processed successfully.")).toBeVisible();
  await waitForPathname(page, OUTCOMES_PATH);
};

// This animal's outcome rows, newest first: the list's default order is by
// outcome day and then by when it was recorded.
const outcomeRows = (page: Page, animalId: string) =>
  page
    .locator("tbody tr")
    .filter({ has: page.locator(`a[href="/dashboard/animals/${animalId}"]`) });

const gotoOutcomeRows = async (page: Page, animalId: string) => {
  await gotoTable(page, `${OUTCOMES_PATH}?pageSize=50`);
  return outcomeRows(page, animalId);
};

// The row's Radix menu occasionally swallows the first click right after a
// navigation, before hydration settles. Retry, re-clicking only while the
// menu is closed so it is never toggled shut.
const openRowMenu = async (row: Locator, itemName: string | RegExp) => {
  const trigger = row.getByRole("button", { name: "Open menu" });
  const item = row.page().getByRole("menuitem", { name: itemName });
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await item.isVisible())) {
      await trigger.click();
    }
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return item;
};

const openReverseDialog = async (row: Locator) => {
  await (await openRowMenu(row, /^Reverse/)).click();
  const dialog = row.page().getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  return dialog;
};

test("a reversed adoption un-adopts, reopens, drops out of the report, and can be recorded again", async ({
  page,
}) => {
  test.setTimeout(240_000);

  const candidate = await prepareCandidate(page);
  const baseline = await reportedAdoptions(page);

  // --- The adoption, recorded through the review page. ---
  await recordAdoption(page, candidate);
  await expectStatuses(page, candidate, "Adopted", "Closed");
  expect(await reportedAdoptions(page)).toBe(baseline + 1);

  const firstRow = (await gotoOutcomeRows(page, candidate.animalId)).first();
  await expect(firstRow).toBeVisible();
  const editItem = await openRowMenu(firstRow, "Edit");
  const editHref = await page
    .locator("a", { has: editItem })
    .first()
    .getAttribute("href");
  expect(editHref).toMatch(/^\/dashboard\/outcomes\/[^/]+\/edit$/);
  await page.keyboard.press("Escape");

  // Two other staff screens, opened before the reversal lands: someone about
  // to reverse the same outcome, and someone about to correct it.
  const context = page.context();
  const secondReverser = await context.newPage();
  const staleRow = (
    await gotoOutcomeRows(secondReverser, candidate.animalId)
  ).first();
  const staleDialog = await openReverseDialog(staleRow);
  await staleDialog
    .getByLabel("Reason for reversal")
    .fill("Also spotted the mistake.");

  const corrector = await context.newPage();
  await corrector.goto(editHref!);
  const notes = corrector.getByLabel("Notes", { exact: true });
  await expect(notes).toBeVisible();

  // --- The reversal. A reason is required before it can be submitted. ---
  const dialog = await openReverseDialog(firstRow);
  const confirm = dialog.getByRole("button", { name: "Reverse Outcome" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Reason for reversal").fill("   ");
  await expect(confirm).toBeDisabled();
  // The length limit is on the trimmed reason, as the server applies it: one
  // character over is refused before anything is sent, while surrounding
  // spaces do not count.
  const tooLong = dialog.getByText("The reason cannot exceed 1000 characters.");
  await dialog.getByLabel("Reason for reversal").fill("x".repeat(1001));
  await expect(tooLong).toBeVisible();
  await expect(confirm).toBeDisabled();
  await dialog
    .getByLabel("Reason for reversal")
    .fill(`   ${"x".repeat(1000)}   `);
  await expect(tooLong).toBeHidden();
  await expect(confirm).toBeEnabled();
  const reason = `Recorded against the wrong application ${Date.now()}`;
  await dialog.getByLabel("Reason for reversal").fill(reason);
  await confirm.click();
  await expect(page.getByText(/^Outcome reversed\./)).toBeVisible();
  await expect(dialog).toBeHidden();

  // The row stays on the list, marked, and links to its read-only record.
  await expect(firstRow.getByText("Reversed", { exact: true })).toBeVisible();
  const viewReversal = await openRowMenu(firstRow, "View reversal");
  await expect(page.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /^Reverse/ })).toHaveCount(0);
  await viewReversal.click();
  await expect(page).toHaveURL(editHref!);
  await expect(
    page.getByRole("heading", { name: "Outcome Reversed" }),
  ).toBeVisible();
  await expect(page.getByText(`Reason: ${reason}`)).toBeVisible();
  await expect(page.locator("main form")).toHaveCount(0);

  await page.goto(candidate.winnerReviewHref);
  await expect(
    page.getByText(`Adoption outcome reversed: ${reason}`),
  ).toBeVisible();
  await expect(page.getByText("Reversed", { exact: true })).toBeVisible();

  // A volunteer has the same read permissions as this record requires.
  const volunteerContext = await page.context().browser()!.newContext({
    storageState: volunteerStatePath,
  });
  const volunteer = await volunteerContext.newPage();
  try {
    const volunteerRow = (
      await gotoOutcomeRows(volunteer, candidate.animalId)
    ).first();
    await expect(volunteerRow.getByText("Reversed", { exact: true })).toBeVisible();
    const volunteerView = await openRowMenu(volunteerRow, "View reversal");
    await expect(volunteer.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
    await expect(volunteer.getByRole("menuitem", { name: /^Reverse/ })).toHaveCount(0);
    await volunteerView.click();
    await expect(volunteer).toHaveURL(editHref!);
    await expect(
      volunteer.getByRole("heading", { name: "Outcome Reversed" }),
    ).toBeVisible();
    await expect(volunteer.getByText(`Reason: ${reason}`)).toBeVisible();
    await expect(volunteer.locator("main form")).toHaveCount(0);
  } finally {
    await volunteerContext.close();
  }

  // A second reversal of the same outcome is refused.
  await staleDialog.getByRole("button", { name: "Reverse Outcome" }).click();
  await expect(
    secondReverser.getByText("This outcome has already been reversed."),
  ).toBeVisible();
  // The refusal refreshes the list, so the row it was refused on now shows
  // what happened, with only the record link available.
  await expect(staleDialog).toBeHidden();
  await expect(staleRow.getByText("Reversed", { exact: true })).toBeVisible();
  await expect(staleRow.getByRole("button", { name: "Open menu" })).toBeVisible();
  await secondReverser.close();

  // So is a correction to it, from a form opened before it was reversed.
  await notes.fill(`A late correction ${Date.now()}`);
  await corrector.getByRole("button", { name: "Update Outcome" }).click();
  await expect(
    corrector.getByText(
      "This outcome was reversed, so it can no longer be corrected.",
    ),
  ).toBeVisible();
  await corrector.close();

  // The winner is approved again and the applications it closed are open,
  // each as it stood before; the report no longer counts the adoption.
  await expectStatuses(page, candidate, "Approved", "as before");
  expect(await reportedAdoptions(page)).toBe(baseline);

  // --- The same application takes a new adoption. ---
  await recordAdoption(page, candidate);
  await expectStatuses(page, candidate, "Adopted", "Closed");
  // One adoption counted, not two: the reversed row stays out.
  expect(await reportedAdoptions(page)).toBe(baseline + 1);

  // Both outcomes are on the list, the new one live and the old one marked.
  const rows = await gotoOutcomeRows(page, candidate.animalId);
  await expect(rows.first().getByText("Reversed", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    rows.filter({ has: page.getByText("Reversed", { exact: true }) }),
  ).toHaveCount(1);

  // The animal's journey keeps the voided adoption, marked, beside the
  // reversal that voided it.
  await page.goto(`/dashboard/animals/${candidate.animalId}/journey`);
  await expect(page.getByText("Outcome: Adopted (reversed)")).toBeVisible();
  await expect(
    page.getByText("Outcome: Reversed", { exact: true }),
  ).toBeVisible();
});
