// Adding and deleting an animal's photo on its Photos tab, through the local
// photo store (playwright/env.ts forces it, so nothing reaches Vercel Blob).
// The rules (what counts as a photo, whose photo may be deleted, which file is
// removed) are in prisma/animal-photos.test.ts; this shows the page is wired
// to them. Phase 2 of the photo editing work rewrites it for the crop editor.
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

const fileInput = (page: Page) => page.locator("input.uppy-Dashboard-input").first();
const uploadedPhotos = (page: Page) => page.locator('img[src^="/api/animal-photos/"]');

test("staff add a photo, see it last under Current Images, and delete it", async ({ page }) => {
  const id = await firstRowIdByQuery(page, "/dashboard/animals", "Fido");
  await page.goto(`/dashboard/animals/${id}/photos`);
  // Fido has photos. Only the loaded gallery shows them; the loading skeleton
  // repeats the card titles.
  await expect(page.getByRole("img", { name: "Animal image" }).first()).toBeVisible();
  const before = await page.getByRole("img", { name: "Animal image" }).count();

  await fileInput(page).setInputFiles(path.join(process.cwd(), "tests/e2e/fixtures/photo.jpg"));
  await expect(page.getByText("Image uploaded successfully!")).toBeVisible();
  const photo = uploadedPhotos(page);
  await expect(photo).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Animal image" })).toHaveCount(before + 1);
  // Last in the order, and the local route serves it.
  await expect(page.getByRole("img", { name: "Animal image" }).last()).toHaveAttribute(
    "src",
    /^\/api\/animal-photos\/[0-9a-f-]{36}\.jpg$/,
  );
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(96);

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
  await expect(page.getByRole("img", { name: "Animal image" })).toHaveCount(before);
});

test("a file that isn't a photo is refused with a message", async ({ page }) => {
  const id = await firstRowIdByQuery(page, "/dashboard/animals", "Fido");
  await page.goto(`/dashboard/animals/${id}/photos`);
  // Fido has photos. Only the loaded gallery shows them; the loading skeleton
  // repeats the card titles.
  await expect(page.getByRole("img", { name: "Animal image" }).first()).toBeVisible();
  const before = await page.getByRole("img", { name: "Animal image" }).count();

  // A PDF named and typed as a JPEG: the route reads its first bytes.
  await fileInput(page).setInputFiles({
    name: "rex.jpg",
    mimeType: "image/jpeg",
    buffer: await readFile(path.join(process.cwd(), "prisma/seed-files/sample-vet-record.pdf")),
  });
  await expect(
    page.getByText("This file isn't a photo. Add a JPEG, PNG or WebP image."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "Animal image" })).toHaveCount(before);
});
