import { test, expect } from "@playwright/test";
import {
  adminStatePath,
  bootstrapAdminAuth,
  fillStable,
  firstRowIdByQuery,
  noteCard,
  openNoteEditDialog,
} from "../support/note-audit";

const storageState = adminStatePath("people-directory");

// The "edited by" footer on a Person's Notes tab.
//
// prisma/seed.ts gives "Jane Doe" (surrenderer1@example.com) a person note
// authored by Benjamin Carter about return-to-owner paperwork that has never
// been edited. Admin editing it exercises lastEditedBy ≠ author.

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

const JANE_NOTE = "return-to-owner paperwork";

test("editing a person note stamps 'edited by Admin User' on the Notes tab", async ({
  page,
}) => {
  const personId = await firstRowIdByQuery(
    page,
    "/dashboard/people-directory",
    "Jane Doe",
  );

  await page.goto(`/dashboard/people-directory/${personId}/notes`);
  const card = noteCard(page, JANE_NOTE);
  await expect(card).toHaveCount(1);
  await expect(card.getByText(/edited by/i)).toHaveCount(0);

  await openNoteEditDialog(page, card);
  const revised = `Return-to-owner paperwork completed and filed. E2E ${Date.now()}`;
  await fillStable(page.getByLabel("Content *", { exact: true }), revised);
  await page.getByRole("button", { name: "Update Note" }).click();
  await expect(page.getByText("Note updated successfully.")).toBeVisible();

  const editedCard = noteCard(page, revised);
  await expect(editedCard.getByText(/edited by Admin User/)).toBeVisible();
  // Focus goes back to the menu's button, not to the page.
  await expect(
    editedCard.getByRole("button", { name: /note actions/i }),
  ).toBeFocused();
});
