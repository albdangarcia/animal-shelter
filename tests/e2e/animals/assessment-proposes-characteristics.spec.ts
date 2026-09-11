import { test, expect, type Page } from "@playwright/test";
import {
  adminStatePath,
  bootstrapAdminAuth,
  fillStable,
  firstRowIdByQuery,
} from "../support/note-audit";
import {
  SEEDED_USER_PASSWORD,
  bootstrapStorageState,
  storageStatePathFor,
} from "../support/applications";

// Suggest-only: a finding proposes a characteristic; staff add it or cite it
// from the assessment's own page — a warning under a contradicted suggestion,
// never a gate. The Characteristics tab shows the citation plus whatever's
// wrong with it — "(deleted)", "(no longer supports it)", a live contradicting
// finding — computed fresh on every load. Nothing is stored but the citation.
//
// Fixtures (prisma/seed.ts):
//  - Frisco (dog) has a "Dog-social" Dog-to-Dog Introduction that proposes
//    "Good with other dogs", unassigned and uncontradicted. He also carries a
//    hand-assigned "Good with cats" that his "Not cat-safe" Cat Test
//    contradicts.
//  - Buddy (dog) has a hand-assigned "Good with other dogs" and a separate
//    "Dog-social" Dog-to-Dog Introduction that proposes the same trait,
//    uncontradicted — a "Cite this assessment" fixture.
//  - Daisy (dog) has a "Cat-safe" Cat Test that already sources "Good with
//    cats"; an older "Not cat-safe" Cat Test of hers is overtaken by it. A
//    deleted "Dog-social" Dog-to-Dog Introduction (recorded on her by
//    mistake) still sources "Good with other dogs".
//  - Rocket (dog) carries a hand-assigned "Good with other dogs" that his
//    "Solo-dog home" Dog-to-Dog Introduction contradicts — no reason on
//    record, because there's nowhere left to put one.
//  - Whiskers (cat) has only species-agnostic templates (no proposing
//    fields) — the control case for "nothing to suggest".
//  - volunteer1@example.com can read assessments and characteristics but not
//    manage characteristics.

const storageState = adminStatePath("assessment-proposals");
const volunteerState = storageStatePathFor(
  "assessment-proposals-volunteer.state.json",
);

test.describe.configure({ mode: "serial" });

// One sign-in per account for the whole file: the sign-in endpoint is
// rate-limited.
test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
  await bootstrapStorageState(browser, {
    email: "volunteer1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: volunteerState,
  });
});

test.use({ storageState });

const animalId = (page: Page, name: string) =>
  firstRowIdByQuery(page, "/dashboard/animals", name);

const pickOption = async (page: Page, label: string, option: string) => {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

const rowFor = (page: Page, templateName: string) =>
  page
    .getByRole("list", { name: "Assessments" })
    .getByRole("listitem")
    .filter({ hasText: templateName });

const isDetailPath = (url: URL) =>
  /\/assessments\/[^/]+$/.test(url.pathname) &&
  !url.pathname.endsWith("/create");

const openRow = async (page: Page, templateName: string) => {
  await rowFor(page, templateName).getByRole("link").click();
  await page.waitForURL(isDetailPath);
};

const sourceLink = (page: Page, templateName: string) =>
  page.getByRole("link", {
    name: new RegExp(`${templateName} assessment of`, "i"),
  });

const recordCatSafeTest = async (page: Page, id: string) => {
  await page.goto(`/dashboard/animals/${id}/assessments/create`);
  await pickOption(page, "Template", "Cat Test");
  await pickOption(page, "Response on first seeing the cat *", "Curious and calm");
  await pickOption(page, "Response at close proximity *", "Calm");
  await pickOption(page, "Recommendation *", "Cat-safe");
  await page.getByRole("button", { name: "Record assessment" }).click();
};

const suggestionsHeading = "Characteristics these findings suggest";

/**
 * Finds an activity-feed entry by its full summary text, not by assuming
 * it's the newest — every entry collapses behind a generic per-type label
 * ("updated pet details") and a "Show details" toggle, so the real text only
 * exists once expanded. Wrapped in `toPass()`: right after navigating here
 * the page can still be re-hydrating, and a click in that window can be a
 * no-op — retrying re-queries and re-clicks whatever is still collapsed.
 */
const expectActivityEntry = async (page: Page, summary: RegExp) => {
  await expect(async () => {
    const detailButtons = page.getByRole("button", { name: "Show details" });
    const toExpand = await detailButtons.count();
    for (let i = 0; i < toExpand; i++) {
      await detailButtons.first().click();
    }
    await expect(page.getByText(summary)).toBeVisible({ timeout: 1_000 });
  }).toPass();
};

// --- Suggesting: add, cite, and a deleted source suggesting nothing ---------

test("an unassigned trait offers 'Add to animal'; acting on it cites the assessment and logs it", async ({
  page,
}) => {
  const id = await animalId(page, "Frisco");
  await page.goto(`/dashboard/animals/${id}/assessments`);
  await openRow(page, "Dog-to-Dog Introduction");

  await expect(page.getByText(suggestionsHeading)).toBeVisible();
  // The list resets list-style, which drops the implicit ARIA list/listitem
  // roles in Chromium — filter on the tag instead of the role.
  const row = page.locator("li").filter({ hasText: "Good with other dogs" });
  await expect(row.getByText('From “Recommendation”: Dog-social')).toBeVisible();
  await row.getByRole("button", { name: "Add to animal" }).click();
  await expect(page.getByText("Good with other dogs added to the animal.")).toBeVisible();

  await page.goto(`/dashboard/animals/${id}/characteristics`);
  await expect(page.getByText("Good with other dogs", { exact: true })).toBeVisible();
  await expect(sourceLink(page, "Dog-to-Dog Introduction")).toBeVisible();

  await page.goto(`/dashboard/animals/${id}`);
  await expectActivityEntry(
    page,
    /Good with other dogs added, citing the Dog-to-Dog Introduction of/,
  );
});

test("a trait assigned elsewhere offers 'Cite this assessment'; acting on it moves the citation", async ({
  page,
}) => {
  const id = await animalId(page, "Buddy");
  await page.goto(`/dashboard/animals/${id}/characteristics`);
  await expect(page.getByText("Good with other dogs", { exact: true })).toBeVisible();
  // Assigned by hand — no citation yet.
  await expect(sourceLink(page, "Dog-to-Dog Introduction")).toHaveCount(0);

  await page.goto(`/dashboard/animals/${id}/assessments`);
  await openRow(page, "Dog-to-Dog Introduction");
  await expect(page.getByText(suggestionsHeading)).toBeVisible();
  await page.getByRole("button", { name: "Cite this assessment" }).click();
  await expect(
    page.getByText("Good with other dogs re-cited to this assessment."),
  ).toBeVisible();
  // Settled: acting on it drops the row.
  await expect(page.getByText(suggestionsHeading)).toHaveCount(0);

  await page.goto(`/dashboard/animals/${id}/characteristics`);
  await expect(sourceLink(page, "Dog-to-Dog Introduction")).toBeVisible();
});

test("editing the cited assessment's answer away from what it proposed: the tab warns, its page offers nothing for the trait", async ({
  page,
}) => {
  // Continues from Buddy's citation above.
  const id = await animalId(page, "Buddy");
  await page.goto(`/dashboard/animals/${id}/assessments`);
  await openRow(page, "Dog-to-Dog Introduction");
  const editUrl = `${new URL(page.url()).pathname}/edit`;

  await page.goto(editUrl);
  await pickOption(page, "Recommendation *", "Needs slow introductions");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`**/dashboard/animals/${id}/assessments`);

  await openRow(page, "Dog-to-Dog Introduction");
  await expect(page.getByText(suggestionsHeading)).toHaveCount(0);

  await page.goto(`/dashboard/animals/${id}/characteristics`);
  await expect(page.getByText("(no longer supports it)")).toBeVisible();
});

test("a deleted assessment suggests nothing", async ({ page }) => {
  const id = await animalId(page, "Daisy");
  // Deleted rows are off the default list, same as any other soft-deleted
  // row — there's no special carve-out any more.
  await page.goto(`/dashboard/animals/${id}/assessments?status=deleted`);
  await openRow(page, "polite play with plenty of breaks");
  await expect(page.getByText(/^Deleted on /)).toBeVisible();
  await expect(page.getByText(suggestionsHeading)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to animal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cite this assessment" })).toHaveCount(0);

  await page.goto(`/dashboard/animals/${id}/characteristics`);
  await expect(page.getByText("(deleted)")).toBeVisible();
});

// --- Warnings: a live contradiction, never a gate ----------------------------

test("a hand-assigned trait a live finding contradicts warns on the tab, with no acknowledgement anywhere", async ({
  page,
}) => {
  const id = await animalId(page, "Frisco");
  await page.goto(`/dashboard/animals/${id}/characteristics`);
  await expect(page.getByText("Good with cats", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/^Contradicted by “Recommendation”: Not cat-safe on the Cat Test of/),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText(/acknowledged/i)).toHaveCount(0);

  // The contradicting assessment itself proposes nothing, so it has no
  // suggestion row for the trait it argues against — the warning lives only
  // on the tab.
  await page.goto(`/dashboard/animals/${id}/assessments`);
  await openRow(page, "Cat Test");
  await expect(page.getByText(suggestionsHeading)).toHaveCount(0);
});

test("adding or removing a contradicted trait on the tab needs no dialog, checkbox, or reason", async ({
  page,
}) => {
  const id = await animalId(page, "Rocket");
  await page.goto(`/dashboard/animals/${id}/characteristics`);
  await expect(
    page.getByText(/^Contradicted by “Recommendation”: Solo-dog home on the/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Remove Good with other dogs" }).click();
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Characteristics updated successfully.")).toBeVisible();
  await expect(page.getByText("Good with other dogs", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByText("Add a characteristic...").click();
  await page.getByRole("option", { name: /^Good with other dogs/ }).click();
  // No conflict UI at all — no checkbox, no reason field, nothing disabling
  // the save.
  await expect(dialog.getByText("Conflicting findings")).toHaveCount(0);
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  const save = dialog.getByRole("button", { name: "Save Changes" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Characteristics updated successfully.")).toBeVisible();

  // Back, and still warned about — a warning is never gated behind acting on it.
  await expect(page.getByText("Good with other dogs", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/^Contradicted by “Recommendation”: Solo-dog home on the/),
  ).toBeVisible();
});

// --- Supersession: an overtaken contradiction, kept from the enforced design -

test("an overtaken contradiction says so on its own page; the tab shows no warning for it", async ({
  page,
}) => {
  const id = await animalId(page, "Daisy");
  await page.goto(`/dashboard/animals/${id}/characteristics`);
  await expect(page.getByText(/^Contradicted by/)).toHaveCount(0);
  await expect(sourceLink(page, "Cat Test")).toBeVisible();

  await page.goto(`/dashboard/animals/${id}/assessments`);
  await openRow(page, "Fixated at the barrier");
  await expect(
    page.getByText(/superseded for Good with cats by the Cat Test of/),
  ).toBeVisible();
  // It contradicts, it doesn't propose — the card shows the superseded note
  // and nothing else, no suggestion to act on.
  await expect(page.getByRole("button", { name: "Add to animal" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cite this assessment" }),
  ).toHaveCount(0);
});

// --- Restore: the citation was never touched while the source was gone -----

test("restoring a deleted assessment removes the tab's '(deleted)' warning", async ({
  page,
}) => {
  const id = await animalId(page, "Daisy");
  await page.goto(`/dashboard/animals/${id}/assessments?status=deleted`);
  await openRow(page, "polite play with plenty of breaks");
  const url = page.url();

  try {
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Assessment restored.")).toBeVisible();
    await expect(page.getByText(/^Deleted on /)).toHaveCount(0);
    // The citation never moved, so there's nothing left to suggest.
    await expect(page.getByText(suggestionsHeading)).toHaveCount(0);

    await page.goto(`/dashboard/animals/${id}/characteristics`);
    await expect(page.getByText("(deleted)")).toHaveCount(0);
    await expect(sourceLink(page, "Dog-to-Dog Introduction")).toBeVisible();
  } finally {
    await page.goto(url);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(/^Deleted on /)).toBeVisible();
  }
});

// --- Catalog rename: matching is by id --------------------------------------

test("renaming a trait in Settings keeps its citation and supersession linked", async ({
  page,
}) => {
  const id = await animalId(page, "Daisy");

  const openCatalogMenu = async (name: string) => {
    await page.goto("/dashboard/settings/characteristics");
    await expect(async () => {
      await page.getByRole("button", { name: `Actions for ${name}` }).click();
      await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });
  };
  const rename = async (from: string, to: string) => {
    await openCatalogMenu(from);
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await fillStable(dialog.getByLabel("Name", { exact: true }), to);
    await dialog.getByRole("button", { name: "Update Characteristic" }).click();
    await expect(page.getByText("Characteristic updated successfully.")).toBeVisible();
  };

  await rename("Good with cats", "Cat-friendly");
  try {
    await page.goto(`/dashboard/animals/${id}/characteristics`);
    await expect(page.getByText("Cat-friendly", { exact: true })).toBeVisible();
    await expect(sourceLink(page, "Cat Test")).toBeVisible();
    await expect(page.getByText("(no longer supports it)")).toHaveCount(0);

    await page.goto(`/dashboard/animals/${id}/assessments`);
    await openRow(page, "Fixated at the barrier");
    await expect(
      page.getByText(/superseded for Cat-friendly by the Cat Test of/),
    ).toBeVisible();

    await openCatalogMenu("Cat-friendly");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(
      page.getByText(
        "Cat-friendly is proposed by the Cat Test assessment template, so it can't be deleted.",
      ),
    ).toBeVisible();
  } finally {
    await rename("Cat-friendly", "Good with cats");
  }
});

// --- No review route, no badge, and the default list ------------------------

test("recording an assessment that proposes a trait redirects straight to the list, badge-free", async ({
  page,
}) => {
  const id = await animalId(page, "Buddy");
  await recordCatSafeTest(page, id);
  await expect(page.getByText("Assessment recorded.")).toBeVisible();
  await page.waitForURL(`**/dashboard/animals/${id}/assessments`);

  const row = rowFor(page, "Cat Test");
  await expect(row).toBeVisible();
  await expect(row.getByText(/to review/)).toHaveCount(0);
  await expect(page.getByText(/to review/)).toHaveCount(0);

  await openRow(page, "Cat Test");
  await expect(page.getByText(suggestionsHeading)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to animal" }),
  ).toBeVisible();
});

test("the default Status filter hides a deleted row exactly like every other soft-deleted list, even one a trait still cites", async ({
  page,
}) => {
  const id = await animalId(page, "Daisy");
  const list = `/dashboard/animals/${id}/assessments`;
  const citedIntro = "polite play with plenty of breaks";

  await page.goto(list);
  await expect(rowFor(page, citedIntro)).toHaveCount(0);

  await page.goto(`${list}?status=deleted`);
  await expect(rowFor(page, citedIntro)).toHaveCount(1);
  await expect(rowFor(page, citedIntro).getByText("Deleted", { exact: true })).toBeVisible();
});

// --- A template with no proposing fields suggests nothing --------------------

test("an assessment from a template with no proposing fields has no suggestions section", async ({
  page,
}) => {
  const id = await animalId(page, "Whiskers");
  await page.goto(`/dashboard/animals/${id}/assessments`);
  await openRow(page, "Handling Sensitivity");
  await expect(page.getByText(suggestionsHeading)).toHaveCount(0);
});

// --- Read-only for a viewer without ANIMAL_CHARACTERISTICS_MANAGE -----------

test("without permission to manage characteristics, suggestions show with no buttons", async ({
  page,
  browser,
}) => {
  // Buddy's Cat Test, recorded and left unassigned by the test above.
  const buddy = await animalId(page, "Buddy");

  const context = await browser.newContext({ storageState: volunteerState });
  const viewer = await context.newPage();
  try {
    await viewer.goto(`/dashboard/animals/${buddy}/assessments`);
    await openRow(viewer, "Cat Test");
    await expect(viewer.getByText(suggestionsHeading)).toBeVisible();
    await expect(viewer.getByText("Good with cats")).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Add to animal" })).toHaveCount(0);
    await expect(
      viewer.getByRole("button", { name: "Cite this assessment" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
