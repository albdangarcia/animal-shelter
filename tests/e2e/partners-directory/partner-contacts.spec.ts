import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  adminStatePath,
  bootstrapAdminAuth,
  fillStable,
  firstRowIdByQuery,
} from "../support/note-audit";

const storageState = adminStatePath("partner-contacts");

// A partner's Contacts tab: re-adding a former contact, the picker leaving out
// administrators, and Primary needing Active. The rules themselves are in
// prisma/partner-contacts.test.ts; this shows the page is wired to them.
//
// The seed has no partner contacts, so the test makes its own through the
// Add Contact form: Benjamin Carter (staff) at Second Chance Rescue.

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

const PARTNER = "Second Chance Rescue";
const CONTACT = "Benjamin Carter";

const contactCard = (page: Page, name: string): Locator =>
  page.locator("div.group.rounded-lg").filter({ hasText: name });

// Sonner toasts stack at the bottom right and can sit over the buttons the
// next step clicks, so wait for each one to go on its own (pointer parked away).
const seeToast = async (page: Page, text: string) => {
  const toast = page.getByText(text);
  await expect(toast).toBeVisible();
  // Sonner holds a toast open while the pointer is over the stack.
  await page.mouse.move(0, 0);
  await expect(toast).toBeHidden({ timeout: 15_000 });
};

const openAddDialog = async (page: Page) => {
  await page.getByRole("button", { name: "Add Contact" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add Contact" });
  await expect(dialog).toBeVisible();
  return dialog;
};

// Search the picker for `query`. Returns the picker's list so the caller can
// look for (or at) a person in it.
const searchPicker = async (dialog: Locator, page: Page, query: string) => {
  await dialog.getByRole("combobox").click();
  await page.getByPlaceholder("Type a name or email...").fill(query);
  return page.getByRole("listbox");
};

// The row menu button sits in an opacity-0 group-hover wrapper, and Radix
// sometimes drops the first click before hydration settles: re-click only
// while the item is not showing.
const clickContactMenuItem = async (
  page: Page,
  card: Locator,
  itemName: string,
) => {
  await expect(card).toHaveCount(1);
  await card.hover();
  const trigger = card.getByRole("button");
  const item = page.getByRole("menuitem", { name: itemName });
  await expect(async () => {
    if (!(await item.isVisible())) {
      await trigger.click();
    }
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await item.click();
};

test("a former contact is re-added from Add Contact and comes back active with the new role; the admin is never offered", async ({
  page,
}) => {
  const partnerId = await firstRowIdByQuery(
    page,
    "/dashboard/partners-directory",
    PARTNER,
  );
  const contactsUrl = `/dashboard/partners-directory/${partnerId}/contacts`;
  await page.goto(contactsUrl);

  // A run that failed partway (CI retries) leaves him active; start from
  // "not an active contact" so the picker offers him either way.
  const existing = contactCard(page, CONTACT);
  if (
    (await existing.count()) > 0 &&
    (await existing.getByText("Inactive").count()) === 0
  ) {
    await clickContactMenuItem(page, existing, "Deactivate");
    await seeToast(page, "Contact deactivated.");
    await expect(existing.getByText("Inactive")).toBeVisible();
  }

  // Add Benjamin the first time (a brand-new contact, or a former one from an
  // earlier attempt that is reactivated).
  let dialog = await openAddDialog(page);
  let list = await searchPicker(dialog, page, CONTACT);
  await list.getByRole("option", { name: new RegExp(CONTACT) }).click();
  await fillStable(dialog.getByLabel("Role"), "Volunteer coordinator");
  await dialog.getByRole("button", { name: "Add Contact" }).click();
  await seeToast(page, "Contact added successfully.");
  const card = contactCard(page, CONTACT);
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Volunteer coordinator")).toBeVisible();

  // The admin's People Directory record can't be opened, so the picker doesn't
  // offer them.
  dialog = await openAddDialog(page);
  list = await searchPicker(dialog, page, "Admin User");
  await expect(page.getByText("No people found.")).toBeVisible();
  await expect(list.getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  // Deactivate him.
  await clickContactMenuItem(page, contactCard(page, CONTACT), "Deactivate");
  await seeToast(page, "Contact deactivated.");
  await expect(card.getByText("Inactive")).toBeVisible();

  // Add him again: the picker marks him, and the form promises to reactivate.
  dialog = await openAddDialog(page);
  list = await searchPicker(dialog, page, CONTACT);
  const option = list.getByRole("option", { name: new RegExp(CONTACT) });
  await expect(option.getByText("Deactivated here")).toBeVisible();
  await option.click();
  await expect(dialog.getByText(/will reactivate that link/)).toBeVisible();

  // Primary needs Active: unticking Active clears and disables it.
  const primary = dialog.getByRole("checkbox", { name: "Primary contact" });
  const active = dialog.getByRole("checkbox", { name: "Active" });
  await primary.click();
  await expect(primary).toBeChecked();
  await active.click();
  await expect(primary).not.toBeChecked();
  await expect(primary).toBeDisabled();
  await expect(dialog.getByText(/Only an active contact/)).toBeVisible();
  await active.click();
  await expect(primary).toBeEnabled();
  await primary.click();
  await expect(primary).toBeChecked();

  await fillStable(dialog.getByLabel("Role"), "Intake Coordinator");
  await dialog.getByRole("button", { name: "Add Contact" }).click();
  await seeToast(page, "Contact added successfully.");
  await expect(page.getByText("already a contact here")).toHaveCount(0);

  // One row, active, primary, with the new role.
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Intake Coordinator")).toBeVisible();
  await expect(card.getByText("Primary", { exact: true })).toBeVisible();
  await expect(card.getByText("Inactive")).toHaveCount(0);
  await expect(card.getByText("Volunteer coordinator")).toHaveCount(0);

  // The partner's page names the same primary.
  await page.goto(`/dashboard/partners-directory/${partnerId}`);
  await expect(page.getByText("No primary contact set.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: CONTACT })).toBeVisible();

  // The Edit box no longer tells staff to Remove a contact.
  await page.goto(contactsUrl);
  await clickContactMenuItem(page, contactCard(page, CONTACT), "Edit");
  const edit = page.getByRole("dialog", { name: "Edit Contact" });
  await expect(
    edit.getByText(/Deactivate this contact and add another/),
  ).toBeVisible();
  await expect(edit.getByText(/Remove this contact/)).toHaveCount(0);
});
