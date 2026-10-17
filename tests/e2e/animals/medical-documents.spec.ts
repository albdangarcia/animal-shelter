import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";
import { firstRowIdByQuery } from "../support/note-audit";

const staffStatePath = storageStatePathFor("medical-documents-staff.state.json");

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "staff1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: staffStatePath,
  });
});

test.use({ storageState: staffStatePath, viewport: { width: 390, height: 844 } });

test("an invalid file returns focus and announces the error; a long name fits on mobile", async ({ page }, testInfo) => {
  const id = await firstRowIdByQuery(page, "/dashboard/animals", "Fido");
  await page.goto(`/dashboard/animals/${id}/medical/documents`);
  await page.getByRole("button", { name: "Upload document", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Upload a document" });
  const file = dialog.getByLabel("File *", { exact: true });
  await file.setInputFiles({
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("This is a text file, despite its name."),
  });
  await dialog.getByRole("combobox", { name: "Type *", exact: true }).click();
  await page.getByRole("option", { name: "Other", exact: true }).click();

  let uploadRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/medical-documents") {
      uploadRequests += 1;
    }
  });
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  const issue = "Upload a PDF, JPEG, PNG or WebP file.";
  await expect(file).toHaveAttribute("aria-invalid", "true");
  await expect(file).toBeEnabled();
  await expect(file).toBeFocused();
  await expect(dialog.getByText(issue, { exact: true })).toBeVisible();
  await expect(page.locator('[aria-live="polite"] [data-sonner-toast][data-type="error"]')).toContainText(issue);
  expect(uploadRequests).toBe(0);

  await file.setInputFiles(path.join(process.cwd(), "prisma/seed-files/sample-vet-record.pdf"));
  const name = `Mobile${testInfo.retry}`.padEnd(200, "x");
  await dialog.getByLabel("Name *", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog).toBeHidden();
  const link = page.getByRole("link", { name, exact: true });
  await expect(link).toBeVisible();
  expect(uploadRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))).toEqual({ content: 390, viewport: 390 });
});
