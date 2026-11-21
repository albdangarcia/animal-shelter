import { test, expect, type Page } from "@playwright/test";
import {
  adminStatePath,
  bootstrapAdminAuth,
  clickNoteMenuItem,
  fillStable,
  firstRowIdByQuery,
  noteCard,
  openNoteEditDialog,
} from "../support/note-audit";

const storageState = adminStatePath("animals");

// the animal note "edited by" footer, the
// matching AnimalActivityLog row on the animal index, the no-op guard, and
// what a refused delete looks like on screen.
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

// The route's loading.tsx shows the same description as the feed, so wait for
// a row with text in it: the skeleton's rows have none. Buddy always has
// activity, so the loaded feed is never the empty state.
const gotoActivity = async (page: Page, id: string) => {
  await page.goto(`/dashboard/animals/${id}`);
  const feed = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "most recent activity logs for this animal" });
  await expect(feed.locator("li").filter({ hasText: /\S/ }).first()).toBeVisible();
};

test("editing an animal note stamps 'edited by Admin User' and feeds the activity log, and a save with no changes writes nothing", async ({
  page,
}) => {
  const id = await buddyId(page);

  // Baseline the activity feed before either save. Comparing before and after
  // (rather than asserting an absolute count) keeps this green when a retry
  // runs after an earlier attempt's edit is already in the (once-per-run
  // reseeded) database.
  await gotoActivity(page, id);
  const activityBefore = await editRows(page).count();

  await page.goto(`/dashboard/animals/${id}/notes`);
  const intakeCard = noteCard(page, INTAKE_NOTE);
  await expect(intakeCard).toHaveCount(1);
  await expect(intakeCard.getByText(/edited by/i)).toHaveCount(0);

  // Submit with every field untouched: the form sends back what it loaded,
  // and the guard short-circuits before the transaction.
  await openNoteEditDialog(page, intakeCard);
  await page.getByRole("button", { name: "Update Note" }).click();
  await expect(page.getByText("No changes to save.")).toBeVisible();

  const card = noteCard(page, MEDICAL_NOTE);
  await openNoteEditDialog(page, card);

  const revised = `Kennel cough resolved on recheck — cleared for adoption. E2E ${Date.now()}`;
  await fillStable(page.getByLabel("Content *", { exact: true }), revised);
  // Leave the category as MEDICAL; changeSummary is the category label.
  await page.getByRole("button", { name: "Update Note" }).click();
  await expect(page.getByText("Note updated successfully.")).toBeVisible();

  // Footer: the denormalized last-editor line (revalidated, no manual reload).
  const editedCard = noteCard(page, revised);
  await expect(editedCard.getByText(/edited by Admin User/)).toBeVisible();
  // Focus goes back to the menu's button, not to the page.
  await expect(
    editedCard.getByRole("button", { name: /note actions/i }),
  ).toBeFocused();
  // The same revalidation re-read the intake note: the no-op left no line.
  await expect(intakeCard.getByText(/edited by/i)).toHaveCount(0);

  // Activity feed on the animal index: exactly one new "edited a note" row,
  // from the real edit and none from the no-op. It is "Admin User edited a
  // note", and the "Show details" expander carries the category label.
  await gotoActivity(page, id);
  await expect(editRows(page)).toHaveCount(activityBefore + 1);
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

// A delete that cannot happen must not look like one that did. The second tab
// is a real second view of the page: it deletes the note, so the first tab,
// which still lists it as live, asks for a delete the server refuses.
test("a delete the server refuses shows a red message with no Undo, and Undo on a real delete brings the note back", async ({
  page,
  context,
}) => {
  const id = await buddyId(page);
  const content = `Refused delete walk E2E ${Date.now()}`;
  const toastWith = (on: Page, message: string) =>
    on.locator("[data-sonner-toast]").filter({ hasText: message });

  await page.goto(`/dashboard/animals/${id}/notes`);
  await page.getByRole("button", { name: "Add Note" }).click();
  await fillStable(page.getByLabel("Content *", { exact: true }), content);
  await page.getByRole("button", { name: "Create Note" }).click();
  await expect(page.getByText("Note created successfully.")).toBeVisible();
  await expect(noteCard(page, content)).toHaveCount(1);

  const otherTab = await context.newPage();
  await otherTab.goto(`/dashboard/animals/${id}/notes`);

  // A delete that works: green, with Undo, and Undo brings the note back.
  // Undo is clicked at once, since a toast lasts only a few seconds.
  await clickNoteMenuItem(otherTab, noteCard(otherTab, content), "Delete");
  const deleted = toastWith(otherTab, "Note deleted successfully.");
  await expect(deleted).toHaveAttribute("data-type", "success");
  await deleted.getByRole("button", { name: "Undo" }).click();
  await expect(toastWith(otherTab, "Note restored successfully.")).toHaveAttribute(
    "data-type",
    "success",
  );
  await expect(noteCard(otherTab, content)).toHaveCount(1);

  // Delete it again from the second tab. The first tab still lists the note
  // as live, so its delete is refused: red, and no Undo.
  await clickNoteMenuItem(otherTab, noteCard(otherTab, content), "Delete");
  await expect(noteCard(otherTab, content)).toHaveCount(0);

  await clickNoteMenuItem(page, noteCard(page, content), "Delete");
  const refused = toastWith(page, "This note is already deleted.");
  await expect(refused).toHaveAttribute("data-type", "error");
  await expect(refused.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(page.getByText("Note deleted successfully.")).toHaveCount(0);
  await otherTab.close();
});
