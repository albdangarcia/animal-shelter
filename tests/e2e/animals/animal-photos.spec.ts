// Adding, replacing, framing and deleting an animal's photo on its Photos tab, through
// the crop editor and the local photo store (playwright/env.ts forces it, so
// nothing reaches Vercel Blob). The rules (what counts as a photo, whose photo
// may be replaced or deleted, stale photos, which file is removed) are in
// prisma/animal-photos.test.ts, and what the editor, the uploader and the
// replace and framing dialogs do with each key, drag and answer is in their
// component tests
// (components/dashboard/animals/photos/); this shows the page is wired to them.
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

test("staff replace a photo with a new crop, in the same place, and the feed says so", async ({ page }) => {
  const before = await openFidosPhotos(page);
  const fixture = path.join(process.cwd(), "tests/e2e/fixtures/photo.jpg");

  // A photo to replace, saved with the crop it starts with: last in the order.
  await fileInput(page).setInputFiles(fixture);
  await page.getByRole("dialog", { name: "Crop photos" }).getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Photo saved.")).toBeVisible();
  const photo = uploadedPhotos(page);
  await expect(photo).toHaveCount(1);
  const oldSrc = await photo.getAttribute("src");
  expect(oldSrc).toMatch(/^\/api\/animal-photos\/[0-9a-f-]{36}\.webp$/);

  // Replace it from its tile: the file chooser opens, and the same photo is
  // cropped again, this time at its left edge.
  const tile = page
    .locator("div", { has: photo })
    .filter({ has: page.getByRole("button", { name: "Replace photo" }) })
    .last();
  await tile.hover();
  const chooser = page.waitForEvent("filechooser");
  await tile.getByRole("button", { name: "Replace photo" }).click();
  await (await chooser).setFiles(fixture);
  const editor = page.getByRole("dialog", { name: "Replace photo" });
  await expect(editor.getByRole("img", { name: "The photo being replaced" })).toBeVisible();
  const box = editor.getByTestId("crop-box");
  await expect(box).toHaveAttribute("data-crop", "120,20,360");
  await box.focus();
  for (let press = 0; press < 3; press++) await page.keyboard.press("Shift+ArrowLeft");
  await expect(box).toHaveAttribute("data-crop", "0,20,360");
  await editor.getByRole("button", { name: "Replace photo" }).click();

  await expect(page.getByText("Photo replaced.")).toBeVisible();
  await expect(editor).toBeHidden();
  // Same place (still last), a new file, and the old one gone from the store.
  await expect(photo).not.toHaveAttribute("src", oldSrc!);
  await expect(galleryPhotos(page)).toHaveCount(before + 1);
  await expect(galleryPhotos(page).last()).toHaveAttribute(
    "src",
    /^\/api\/animal-photos\/[0-9a-f-]{36}\.webp$/,
  );
  const newSrc = await photo.getAttribute("src");
  expect((await page.request.get(oldSrc!)).status()).toBe(404);
  expect((await page.request.get(newSrc!)).status()).toBe(200);

  // The animal's activity feed: the entry's text shows once expanded.
  const photosUrl = page.url();
  await page.goto(photosUrl.replace(/\/photos$/, ""));
  await expect(page.getByText("replaced a photo").first()).toBeVisible();
  await expect(async () => {
    const details = page.getByRole("button", { name: "Show details" });
    const toExpand = await details.count();
    for (let i = 0; i < toExpand; i++) await details.first().click();
    await expect(page.getByText(`New URL: ${newSrc}`, { exact: false })).toBeVisible({ timeout: 1_000 });
  }).toPass();

  // Leave Fido as he was.
  await page.goto(photosUrl);
  await expect(photo).toHaveCount(1);
  await tile.hover();
  await tile.getByRole("button", { name: "Delete image" }).click();
  await page.getByRole("button", { name: "Delete Image", exact: true }).click();
  await expect(page.getByText("Image deleted successfully.")).toBeVisible();
  await expect(galleryPhotos(page)).toHaveCount(before);
});

test("deleting a photo replaced in another tab is refused, and the new photo stays", async ({ page }) => {
  const before = await openFidosPhotos(page);
  const fixture = path.join(process.cwd(), "tests/e2e/fixtures/photo.jpg");

  // A photo to delete, saved with the crop it starts with: last in the order.
  await fileInput(page).setInputFiles(fixture);
  await page.getByRole("dialog", { name: "Crop photos" }).getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Photo saved.")).toBeVisible();
  const photo = uploadedPhotos(page);
  await expect(photo).toHaveCount(1);
  const oldSrc = (await photo.getAttribute("src"))!;

  // Another tab replaces it, after this one loaded it.
  const otherTab = await page.context().newPage();
  await otherTab.goto(page.url());
  const otherPhoto = uploadedPhotos(otherTab);
  const otherTile = otherTab
    .locator("div", { has: otherPhoto })
    .filter({ has: otherTab.getByRole("button", { name: "Replace photo" }) })
    .last();
  await otherTile.hover();
  const chooser = otherTab.waitForEvent("filechooser");
  await otherTile.getByRole("button", { name: "Replace photo" }).click();
  await (await chooser).setFiles(fixture);
  const replacer = otherTab.getByRole("dialog", { name: "Replace photo" });
  await expect(replacer.getByTestId("crop-box")).toHaveAttribute("data-crop", "120,20,360");
  await replacer.getByRole("button", { name: "Replace photo" }).click();
  await expect(otherTab.getByText("Photo replaced.")).toBeVisible();
  await expect(otherPhoto).not.toHaveAttribute("src", oldSrc);
  const newSrc = (await otherPhoto.getAttribute("src"))!;
  await otherTab.close();

  // This tab still shows the old photo: deleting it is refused.
  await expect(photo).toHaveAttribute("src", oldSrc);
  const tile = page
    .locator("div", { has: photo })
    .filter({ has: page.getByRole("button", { name: "Delete image" }) })
    .last();
  await tile.hover();
  await tile.getByRole("button", { name: "Delete image" }).click();
  await page.getByRole("button", { name: "Delete Image", exact: true }).click();
  await expect(
    page.getByText("This photo has changed since you opened the page.", { exact: false }),
  ).toBeVisible();

  // The other tab's photo is still there, with its file.
  await page.reload();
  await expect(photo).toHaveAttribute("src", newSrc);
  await expect(galleryPhotos(page)).toHaveCount(before + 1);
  expect((await page.request.get(newSrc)).status()).toBe(200);

  // Leave Fido as he was.
  await tile.hover();
  await tile.getByRole("button", { name: "Delete image" }).click();
  await page.getByRole("button", { name: "Delete Image", exact: true }).click();
  await expect(page.getByText("Image deleted successfully.")).toBeVisible();
  await expect(galleryPhotos(page)).toHaveCount(before);
});

test("a photo's framing reaches the listing and the animal's page, set when added and adjusted later", async ({ page }) => {
  const before = await openFidosPhotos(page);
  const photosUrl = page.url();
  const animalId = photosUrl.match(/animals\/([^/]+)\/photos$/)![1];

  // Added framed at the top: the Animal's page preview, Home.
  await fileInput(page).setInputFiles(path.join(process.cwd(), "tests/e2e/fixtures/photo.jpg"));
  const editor = page.getByRole("dialog", { name: "Crop photos" });
  const pagePreview = editor.getByRole("slider", { name: "Framing: Animal's page" });
  await pagePreview.focus();
  await page.keyboard.press("Home");
  await expect(pagePreview).toHaveAttribute("aria-valuetext", "Top");
  await editor.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Photo saved.")).toBeVisible();
  const photo = uploadedPhotos(page);
  await expect(photo).toHaveCount(1);
  // The file's own name: the public page may serve it through the image
  // optimiser, whose src holds it encoded.
  const fileName = (await photo.getAttribute("src"))!.split("/").pop()!;

  /** The large photo on Fido's public page, with the new photo selected. */
  const publicLargePhoto = async () => {
    await page.goto(`/pets/${animalId}`);
    // Last in the order, so last among the thumbnails.
    await page.getByRole("button", { name: `Select pet image ${before + 1}` }).click();
    const large = page.getByRole("img", { name: "Selected pet image, click to enlarge" });
    await expect(large).toHaveAttribute("src", new RegExp(fileName.replace(".", "\\.")));
    return large;
  };
  const objectPosition = (large: Awaited<ReturnType<typeof publicLargePhoto>>) =>
    large.evaluate((img: HTMLImageElement) => getComputedStyle(img).objectPosition);

  expect(await objectPosition(await publicLargePhoto())).toBe("50% 0%");
  // The seed photos were never framed: centred, as before.
  await page.getByRole("button", { name: "Select pet image 1" }).click();
  const large = page.getByRole("img", { name: "Selected pet image, click to enlarge" });
  await expect(large).toHaveAttribute("src", /seed-images/);
  expect(await objectPosition(large)).toBe("50% 50%");

  // The new photo isn't needed any more.
  await page.goto(photosUrl);
  const tile = page
    .locator("div", { has: photo })
    .filter({ has: page.getByRole("button", { name: "Delete image" }) })
    .last();
  await tile.hover();
  await tile.getByRole("button", { name: "Delete image" }).click();
  await page.getByRole("button", { name: "Delete Image", exact: true }).click();
  await expect(page.getByText("Image deleted successfully.")).toBeVisible();
  await expect(galleryPhotos(page)).toHaveCount(before);

  // Adjusted on a saved photo, the primary (a seed photo, which has no
  // original): framed at the bottom, then back to centred.
  const primaryTile = page
    .locator("div", { has: page.getByText("Primary photo", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Adjust framing" }) })
    .last();
  const framing = page.getByRole("dialog", { name: "Adjust framing" });
  const framingPreview = framing.getByRole("slider", { name: "Framing: Animal's page" });
  const adjustPrimary = async (keyOrCentre: "End" | "Centre") => {
    await primaryTile.hover();
    await primaryTile.getByRole("button", { name: "Adjust framing" }).click();
    if (keyOrCentre === "Centre") {
      await framing.getByRole("button", { name: "Centre" }).click();
    } else {
      await expect(framingPreview).toHaveAttribute("aria-valuetext", "Centred");
      await framingPreview.focus();
      await page.keyboard.press(keyOrCentre);
    }
    await framing.getByRole("button", { name: "Save framing" }).click();
    await expect(page.getByText("Framing saved.")).toBeVisible();
    await expect(framing).toBeHidden();
  };
  /** Fido's card on the public listing, which shows his primary photo. */
  const listingPhoto = async () => {
    await page.goto("/pets?query=Fido");
    return page.getByRole("img", { name: "Photo of Fido", exact: true });
  };

  await adjustPrimary("End");
  await page.goto(`/pets/${animalId}`);
  expect(await objectPosition(large)).toBe("50% 100%");
  expect(await objectPosition(await listingPhoto())).toBe("50% 100%");

  // Leave Fido as he was.
  await page.goto(photosUrl);
  await adjustPrimary("Centre");
  expect(await objectPosition(await listingPhoto())).toBe("50% 50%");
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
