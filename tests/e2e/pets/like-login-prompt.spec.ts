import { expect, test } from "@playwright/test";

// /pets is public. Signed out, the heart on a pet card opens LoginPromptModal.
//
// The bug under test: Radix portals the dialog to <body>, but React events
// still propagate through the React tree — and the heart (LikeButton) sits
// inside PetCard's <Link>. So dismissing the modal used to bubble a click into
// the Link and navigate to the pet's detail page instead of just closing.
//
// Card ordering varies run to run, so these assertions never name a pet — they
// only check that the URL stays on /pets through every dismissal path.

const openModal = async (page: import("@playwright/test").Page) => {
  await page.goto("/pets");
  await page.locator('button[aria-label="Like this pet"]').first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
};

for (const { name, dismiss } of [
  {
    name: "the X button",
    dismiss: (page: import("@playwright/test").Page) =>
      page.getByRole("dialog").getByRole("button", { name: "Close" }).click(),
  },
  {
    name: "the Cancel button",
    dismiss: (page: import("@playwright/test").Page) =>
      page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click(),
  },
  {
    name: "Escape",
    dismiss: (page: import("@playwright/test").Page) =>
      page.keyboard.press("Escape"),
  },
  {
    name: "a backdrop click",
    dismiss: (page: import("@playwright/test").Page) =>
      page
        .locator('[data-slot="dialog-overlay"]')
        .click({ position: { x: 5, y: 5 } }),
  },
]) {
  test(`dismissing the login prompt via ${name} closes it without navigating`, async ({
    page,
  }) => {
    await openModal(page);

    await dismiss(page);

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/pets$/);
  });
}

test("the login prompt's sign-in action still navigates to /sign-in", async ({
  page,
}) => {
  await openModal(page);

  await page.getByRole("link", { name: /Login \/ Sign Up/ }).click();

  await page.waitForURL((url) => url.pathname === "/sign-in");
  expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe("/pets");
});
