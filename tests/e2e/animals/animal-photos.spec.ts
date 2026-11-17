// Adding and deleting an animal's photo on its Photos tab, through the crop
// editor and the local photo store (playwright/env.ts forces it, so nothing
// reaches Vercel Blob). The rules (what counts as a photo, whose photo may be
// deleted, which file is removed) are in prisma/animal-photos.test.ts, and
// what the editor and the uploader do with each key, drag and answer is in
// their component tests (components/dashboard/animals/photos/); this shows
// the page is wired to them.
import path from "node:path";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  bootstrapStorageState,
  SEEDED_USER_PASSWORD,
  storageStatePathFor,
} from "../support/applications";
import { firstRowIdByQuery } from "../support/note-audit";

const staffStatePath = storageStatePathFor("animal-photos-staff.state.json");

test.beforeAll(async ({ browser }) => {
  await bootstrapStorageState(browser, {
    email: "staff1@example.com",
    password: SEEDED_USER_PASSWORD,
    storageStatePath: staffStatePath,
  });
});

test.use({ storageState: staffStatePath });

const fileInput = (page: Page) => page.getByTestId("photo-file-input");
const uploadedPhotos = (page: Page) => page.locator('img[src^="/api/animal-photos/"]');
const galleryPhotos = (page: Page) => page.getByRole("img", { name: "Animal image" });

/** Opens Fido's Photos tab and answers how many photos he has. */
async function openFidosPhotos(page: Page): Promise<number> {
  const id = await firstRowIdByQuery(page, "/dashboard/animals", "Fido");
  await page.goto(`/dashboard/animals/${id}/photos`);
  // Fido has photos. Only the loaded gallery shows them; the loading skeleton
  // repeats the card titles.
  await expect(galleryPhotos(page).first()).toBeVisible();
  return galleryPhotos(page).count();
}

test("staff crop a photo, see it last under Current Images, and delete it", async ({ page }) => {
  const before = await openFidosPhotos(page);

  // A 600 × 400 photo: the editor starts with a 360px square in the middle.
  await fileInput(page).setInputFiles(path.join(process.cwd(), "tests/e2e/fixtures/photo.jpg"));
  const editor = page.getByRole("dialog", { name: "Crop photos" });
  const box = editor.getByTestId("crop-box");
  await expect(box).toHaveAttribute("data-crop", "120,20,360");
  await expect(editor.getByRole("img", { name: "Preview: Home page" })).toBeVisible();

  // Moved to the right edge with the keys (Shift: 40px a press).
  await box.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(box).toHaveAttribute("data-crop", "240,20,360");
  await editor.getByRole("button", { name: "Save photo" }).click();

  await expect(page.getByText("Photo saved.")).toBeVisible();
  await expect(editor).toBeHidden();
  const photo = uploadedPhotos(page);
  await expect(photo).toHaveCount(1);
  await expect(galleryPhotos(page)).toHaveCount(before + 1);
  // Last in the order, saved as a WebP, and the local route serves it: the
  // 360px square, not the whole photo.
  await expect(galleryPhotos(page).last()).toHaveAttribute(
    "src",
    /^\/api\/animal-photos\/[0-9a-f-]{36}\.webp$/,
  );
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(360);
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(360);

  // The innermost element holding both the photo and a delete button: its tile.
  const tile = page
    .locator("div", { has: photo })
    .filter({ has: page.getByRole("button", { name: "Delete image" }) })
    .last();
  await tile.hover();
  await tile.getByRole("button", { name: "Delete image" }).click();
  await page.getByRole("button", { name: "Delete Image", exact: true }).click();
  await expect(page.getByText("Image deleted successfully.")).toBeVisible();
  await expect(photo).toHaveCount(0);
  await expect(galleryPhotos(page)).toHaveCount(before);
});

test("a file the browser can't open as a photo is refused with a message", async ({ page }) => {
  const before = await openFidosPhotos(page);

  // A PDF named and typed as a JPEG: the browser can't draw it, so there is
  // nothing to crop.
  await fileInput(page).setInputFiles({
    name: "rex.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile(path.join(process.cwd(), "prisma/seed-files/sample-vet-record.pdf")),
  });
  await expect(
    page.getByText("This file can't be opened as a photo in this browser, so it wasn't added.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText("rex.jpg")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Crop photos" })).toBeHidden();
  await page.reload();
  await expect(galleryPhotos(page).first()).toBeVisible();
  await expect(galleryPhotos(page)).toHaveCount(before);
});
