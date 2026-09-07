import { test, expect } from "@playwright/test";
import {
  adminStatePath,
  bootstrapAdminAuth,
  fillStable,
  firstRowIdByQuery,
  noteCard,
  openNoteEditDialog,
} from "../support/note-audit";

const storageState = adminStatePath("partners-directory");

// The "edited by" footer on a Partner's Notes tab.
// This is the first spec under tests/e2e/partners-directory/.
//
// prisma/seed.ts gives "Downtown Veterinary Clinic" a partner note authored by
// Olivia Chen about after-hours emergencies that has never been edited. Partner
// notes only ever land in NoteEvent (no activity feed), so the footer is the
// whole visible surface.

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

const VET_NOTE = "After-hours emergencies";

test("editing a partner note stamps 'edited by Admin User' on the Notes tab", async ({
  page,
}) => {
  const partnerId = await firstRowIdByQuery(
    page,
    "/dashboard/partners-directory",
    "Downtown Veterinary Clinic",
  );

  await page.goto(`/dashboard/partners-directory/${partnerId}/notes`);
  const card = noteCard(page, VET_NOTE);
  await expect(card).toHaveCount(1);
  await expect(card.getByText(/edited by/i)).toHaveCount(0);

  await openNoteEditDialog(page, card);
  const revised = `After-hours emergencies now handled on-site; Riverside referral retired. E2E ${Date.now()}`;
  await fillStable(page.getByLabel("Content", { exact: true }), revised);
  await page.getByRole("button", { name: "Update Note" }).click();
  await expect(page.getByText("Note updated successfully.")).toBeVisible();

  await expect(
    noteCard(page, revised).getByText(/edited by Admin User/),
  ).toBeVisible();
});
