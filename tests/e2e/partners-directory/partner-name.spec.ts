import { test, expect, type Page } from "@playwright/test";
import {
  adminStatePath,
  bootstrapAdminAuth,
  fillStable,
} from "../support/note-audit";

const storageState = adminStatePath("partner-name");

// A partner's name is unique in any capitals. The rule itself, with its
// inactive partners, wildcard characters and untouched edits, is in
// prisma/partner-name.test.ts; this shows the Add Partner and Edit Partner
// forms are wired to it and that the refusal reaches the Name field.

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  await bootstrapAdminAuth(browser, storageState);
});

test.use({ storageState });

const runId = Date.now().toString(36);
const FIRST = `Walk Vet Clinic ${runId}`;
const SECOND = `Harbor Rescue ${runId}`;
const TAKEN = "A partner with this name already exists.";

const fillForm = async (page: Page, name: string) => {
  await fillStable(page.getByLabel("Name", { exact: false }).first(), name);
};

const pickType = async (page: Page, label: string) => {
  await page.getByRole("combobox", { name: /Type/ }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
};

const createPartner = async (page: Page, name: string, type: string) => {
  await page.goto("/dashboard/partners-directory/new");
  await expect(page.getByText("New Partner", { exact: true })).toBeVisible();
  await fillForm(page, name);
  await pickType(page, type);
  await page.getByRole("button", { name: "Create Partner" }).click();
};

// The page of the partner just created: /dashboard/partners-directory/<id>.
// "new" would match a bare id pattern too, so it is ruled out.
const createdPartnerId = async (page: Page) => {
  await page.waitForURL((url) =>
    /^\/dashboard\/partners-directory\/(?!new$)[a-z0-9]+$/.test(url.pathname),
  );
  return new URL(page.url()).pathname.split("/").pop() as string;
};

test("a partner name that differs only in capitals is refused on add and on rename", async ({
  page,
}) => {
  // Add two partners.
  await createPartner(page, FIRST, "Vet Clinic");
  await createdPartnerId(page);
  await createPartner(page, SECOND, "Rescue Group");
  const secondId = await createdPartnerId(page);

  // Adding the first again in lower case is refused, on the Name field.
  await createPartner(page, FIRST.toLowerCase(), "Vet Clinic");
  await expect(page.getByText(TAKEN)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/partners-directory\/new$/);

  // Renaming the second to the first in capitals is refused the same way.
  await page.goto(`/dashboard/partners-directory/${secondId}/edit`);
  await expect(page.getByText("Edit Partner", { exact: true })).toBeVisible();
  await fillForm(page, FIRST.toUpperCase());
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText(TAKEN)).toBeVisible();
  await expect(page).toHaveURL(/\/edit$/);

  // A rename to a name nobody has saves.
  await fillForm(page, `${SECOND} East`);
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/partners-directory/${secondId}$`),
  );
  await expect(page.getByText(`${SECOND} East`).first()).toBeVisible();
});
