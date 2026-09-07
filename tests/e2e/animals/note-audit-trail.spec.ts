import { test, expect, type Page } from "@playwright/test";
import {
  adminStatePath,
  bootstrapAdminAuth,
  fillStable,
  firstRowIdByQuery,
  noteCard,
  openNoteEditDialog,
} from "../support/note-audit";

const storageState = adminStatePath("animals");

// the animal note "edited by" footer, the
// matching AnimalActivityLog row on the animal index, and the no-op guard.
//
// Fixtures come from prisma/seed.ts (playwright/global-setup.ts reseeds before
// every run):
//   - Buddy has an audit fixture note, category MEDICAL, authored by Olivia Chen
//     and already deleted-then-restored, plus a plain GENERAL intake note that
//     has never been edited (lastEditedAt null).
// Signing in as admin@example.com → "Admin User" makes every edit here land
// lastEditedBy ≠ author with no second login.

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

const buddyId = async (page: Page) =>
  firstRowIdByQuery(page, "/dashboard/animals", "Buddy");

const MEDICAL_NOTE = "Kennel cough suspected";
const INTAKE_NOTE = "Initial intake notes";

const editRows = (page: Page) =>
  page.locator("li").filter({ hasText: "edited a note" });

const gotoActivity = async (page: Page, id: string) => {
  await page.goto(`/dashboard/animals/${id}`);
  await expect(
    page.getByText("most recent activity logs for this animal").first(),
  ).toBeVisible();
};

test("no-op save writes nothing: no 'edited by' line, no new activity row", async ({
  page,
}) => {
  const id = await buddyId(page);

  // Baseline the activity feed *before* the no-op. Comparing a before/after
  // count (rather than asserting an absolute 0) keeps this green when
  // Playwright's serial-mode retry re-runs the group and the sibling test's
  // real edit is still in the (once-per-run reseeded) database.
  await gotoActivity(page, id);
  const activityBefore = await editRows(page).count();

  await page.goto(`/dashboard/animals/${id}/notes`);
  const card = noteCard(page, INTAKE_NOTE);
  await expect(card).toHaveCount(1);
  await expect(card.getByText(/edited by/i)).toHaveCount(0);

  await openNoteEditDialog(page, card);
  // Submit with every field untouched — the guard short-circuits before the txn.
  await page.getByRole("button", { name: "Update Note" }).click();
  await expect(page.getByText("No changes to save.")).toBeVisible();

  // Footer still has no "edited by" line...
  await page.goto(`/dashboard/animals/${id}/notes`);
  await expect(noteCard(page, INTAKE_NOTE).getByText(/edited by/i)).toHaveCount(
    0,
  );

  // ...and the activity feed (animal index, suffix "") gained no row.
  await gotoActivity(page, id);
  await expect(editRows(page)).toHaveCount(activityBefore);
});

test("editing an animal note stamps 'edited by Admin User' and feeds the activity log", async ({
  page,
}) => {
  const id = await buddyId(page);

  await page.goto(`/dashboard/animals/${id}/notes`);
  const card = noteCard(page, MEDICAL_NOTE);
  await openNoteEditDialog(page, card);

  const revised = `Kennel cough resolved on recheck — cleared for adoption. E2E ${Date.now()}`;
  await fillStable(page.getByLabel("Content", { exact: true }), revised);
  // Leave the category as MEDICAL; changeSummary is the category label.
  await page.getByRole("button", { name: "Update Note" }).click();
  await expect(page.getByText("Note updated successfully.")).toBeVisible();

  // Footer: the denormalized last-editor line (revalidated, no manual reload).
  const editedCard = noteCard(page, revised);
  await expect(editedCard.getByText(/edited by Admin User/)).toBeVisible();

  // Activity feed on the animal index: "Admin User edited a note", and the
  // "Show details" expander carries the category label.
  await gotoActivity(page, id);
  const row = page
    .locator("li")
    .filter({ hasText: "Admin User" })
    .filter({ hasText: "edited a note" })
    .first();
  await expect(row).toBeVisible();

  // The feed is server-rendered; on a slow runner the first click can land
  // before React attaches the toggle handler. Retry until the panel sticks
  // open (the button text flips Show/Hide, so match either).
  const detail = row.getByText("Medical", { exact: true });
  await expect(async () => {
    if (!(await detail.isVisible())) {
      await row.getByRole("button", { name: /details/i }).click();
    }
    await expect(detail).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
});
