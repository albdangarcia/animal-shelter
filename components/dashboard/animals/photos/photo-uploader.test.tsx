import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { toast as sonner, Toaster } from "sonner";
import PhotoUploader, {
  PHOTO_SAVED_MESSAGE,
  PHOTO_UPLOAD_ENDPOINT,
} from "@/components/dashboard/animals/photos/photo-uploader";
import {
  UNREADABLE_PHOTO_MESSAGE,
  UPLOAD_FAILED_MESSAGE,
  UPLOAD_UNREACHABLE_MESSAGE,
} from "@/components/dashboard/animals/photos/upload-errors";
import {
  MAX_PHOTO_BYTES,
  PHOTO_TOO_LARGE_MESSAGE,
} from "@/app/lib/storage/photo-size";
import { CROP_OUTPUT_SIZE } from "@/app/lib/utils/photo-crop";
import { resetNavigation, routerCalls } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The Photos tab's uploader: photos are chosen, cropped in a dialog, and each
// is saved on its own to a stand-in for POST /api/animal-photos. The test
// swaps `fetch` for one that answers that address from `replies`: no request
// leaves the page, and nothing reaches the photo store. Everything else is
// real: the browser decodes each photo, and the crop is drawn on a canvas.
// These keep what the old uploader's tests covered (a refusal's reason, no
// retries, sending again, a 413, photos the browser can't open, batches),
// now through the editor.

// `text` is a body that isn't JSON, such as a platform's error page.
type Reply = { status: number; body?: unknown; text?: string } | "no answer";

let replies: Reply[] = [];
// The file and animal each request carried.
let sent: { file: File; animalId: string; focusY: FormDataEntryValue | null }[] = [];
// A request no reply was set up for: the test fails on it after the run.
let unexpected: string[] = [];
// While set, every request waits for it before it is answered.
let holdReplies: Promise<void> | null = null;

/** Holds every reply until the returned function is called. */
function holdAnswers() {
  let release!: () => void;
  holdReplies = new Promise<void>((resolve) => (release = resolve));
  return () => {
    holdReplies = null;
    release();
  };
}

beforeEach(async () => {
  replies = [];
  sent = [];
  unexpected = [];
  holdReplies = null;
  resetNavigation("/dashboard/animals/animal-1/photos");
  await page.viewport(1100, 900);
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== PHOTO_UPLOAD_ENDPOINT) return realFetch(input, init);
    const form = init?.body as FormData;
    sent.push({
      file: form.get("file") as File,
      animalId: String(form.get("animalId")),
      focusY: form.get("focusY"),
    });
    if (holdReplies) await holdReplies;
    const reply = replies.shift();
    if (!reply) {
      unexpected.push(`request ${sent.length}`);
      return new Response(null, { status: 599 });
    }
    if (reply === "no answer") throw new TypeError("Failed to fetch");
    return new Response(reply.text ?? JSON.stringify(reply.body ?? {}), {
      status: reply.status,
    });
  });
});

// Sonner keeps its toasts in module state, and a new <Toaster> shows the ones
// still there: without dismissing them, a toast from the test before passes
// this test's check before its own upload has even been answered.
afterEach(async () => {
  await cleanup();
  sonner.dismiss();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(unexpected).toEqual([]);
});

/**
 * A photo drawn on a canvas: quarters of red, green, blue and yellow
 * (top-left, top-right, bottom-left, bottom-right), so a test can tell
 * which part of it was saved.
 */
async function photoFile(
  name = "charlie.png",
  { width = 400, height = 400, type = "image/png" } = {},
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  const quarters = ["#f00", "#0f0", "#00f", "#ff0"];
  quarters.forEach((colour, index) => {
    context.fillStyle = colour;
    context.fillRect(
      (index % 2) * (width / 2),
      Math.floor(index / 2) * (height / 2),
      width / 2,
      height / 2,
    );
  });
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.9),
  );
  if (!blob) throw new Error("Couldn't make the photo");
  return new File([blob], name, { type });
}

/** A file no browser can open as an image, like a HEIC photo in Chrome. */
const unreadablePhoto = (name = "rex.heic") =>
  new File(["not really a photo"], name, { type: "image/heic" });

async function renderUploader() {
  await render(
    <>
      <PhotoUploader animalId="animal-1" canManage />
      <Toaster />
    </>,
  );
  const add = (...photos: File[]) =>
    userEvent.upload(page.getByTestId("photo-file-input"), photos);
  return { add };
}

const dialog = () => page.getByRole("dialog", { name: "Crop photos" });
const cropBox = () => page.getByTestId("crop-box");
const saveButton = () => page.getByRole("button", { name: "Save photo" });
const toast = (text: string) => page.getByText(text, { exact: true });
/** The batch list's entry for `name`. */
const listed = (name: string) =>
  page.getByRole("list", { name: "Photos to crop" }).getByRole("button", { name });

/** Adds `photos` and waits for the first to be ready to crop. */
async function addPhotos(...photos: File[]) {
  const { add } = await renderUploader();
  await add(...photos);
  await expect.element(cropBox()).toBeVisible();
}

/** Adds one photo and saves it with the crop it starts with. */
async function saveOnePhoto(photo?: File) {
  await addPhotos(photo ?? (await photoFile()));
  await saveButton().click();
}

/** The colour at (x, y) of an image file, as [r, g, b]. */
async function colourAt(file: Blob, x: number, y: number) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
}

const near = (actual: number[], expected: number[]) =>
  actual.every((value, index) => Math.abs(value - expected[index]) < 40);

test("adding a photo opens it to crop, and Save sends the crop", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/a.webp" } }];

  await saveOnePhoto();

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent).toHaveLength(1);
  expect(sent[0].animalId).toBe("animal-1");
  expect(routerCalls).toEqual([{ method: "refresh", href: "" }]);
});

test("the saved photo is the cropped square, not the whole photo", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/a.webp" } }];
  await addPhotos(await photoFile());

  // The smallest crop (200px, the minimum), moved into the top-right corner:
  // the green quarter.
  await page.getByRole("slider", { name: "Zoom" }).click();
  await userEvent.keyboard("{End}");
  await cropBox().click();
  await userEvent.keyboard(
    "{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowUp}{ArrowUp}{ArrowUp}{/Shift}",
  );
  await expect.element(cropBox()).toHaveAttribute("data-crop", "200,0,200");
  await saveButton().click();

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  const [{ file }] = sent;
  const bitmap = await createImageBitmap(file);
  // Never enlarged: a 200px crop is saved at 200px.
  expect([bitmap.width, bitmap.height]).toEqual([200, 200]);
  bitmap.close();
  for (const [x, y] of [[5, 5], [195, 5], [5, 195], [195, 195], [100, 100]]) {
    expect(near(await colourAt(file, x, y), [0, 255, 0])).toBe(true);
  }
});

test("a photo from a phone is sent as a 1200px square WebP, far under 4 MB", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/rex.webp" } }];
  const photo = await photoFile("IMG_0042.JPG", {
    width: 4000,
    height: 3000,
    type: "image/jpeg",
  });

  await saveOnePhoto(photo);

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  const [{ file }] = sent;
  expect(file.name).toBe("IMG_0042.webp");
  expect(file.type).toBe("image/webp");
  expect(file.size).toBeLessThan(MAX_PHOTO_BYTES / 10);
  const bitmap = await createImageBitmap(file);
  expect([bitmap.width, bitmap.height]).toEqual([CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE]);
  bitmap.close();
});

// Safari can't write WebP: asked for one, it hands back a PNG.
test("a browser that can't write WebP sends a JPEG", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/a.jpg" } }];
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: number,
  ) {
    return toBlob.call(this, callback, type === "image/webp" ? "image/png" : type, quality);
  });

  await saveOnePhoto();

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  const [{ file }] = sent;
  expect(file.name).toBe("charlie.jpg");
  expect(file.type).toBe("image/jpeg");
  expect(Array.from(new Uint8Array(await file.slice(0, 3).arrayBuffer()))).toEqual([
    0xff, 0xd8, 0xff,
  ]);
});

test("a refusal shows the route's reason, and the photo stays to crop", async () => {
  replies = [
    {
      status: 403,
      body: { error: "Forbidden: You do not have permission to upload files." },
    },
  ];

  await saveOnePhoto();

  await expect
    .element(toast("Forbidden: You do not have permission to upload files."))
    .toBeVisible();
  await expect.element(dialog()).toBeVisible();
  await expect.element(saveButton()).toBeEnabled();
  expect(sent).toHaveLength(1);
  expect(routerCalls).toEqual([]);
});

test("a refusal without a reason shows the general message", async () => {
  replies = [{ status: 400, body: {} }];

  await saveOnePhoto();

  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  expect(sent).toHaveLength(1);
});

test("a server failure shows the general message, without retrying", async () => {
  replies = [{ status: 500, body: { error: "Upload failed." } }];

  await saveOnePhoto();

  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  // Nothing else is sent: a second request would find no reply and fail the
  // test after it.
  await expect.element(saveButton()).toBeEnabled();
  expect(sent).toHaveLength(1);
});

test("no answer at all says the server couldn't be reached", async () => {
  replies = ["no answer"];

  await saveOnePhoto();

  await expect.element(toast(UPLOAD_UNREACHABLE_MESSAGE)).toBeVisible();
  expect(sent).toHaveLength(1);
});

// Vercel's own refusal, with an error page rather than the route's JSON.
test("a 413 from the platform says the photo is too big", async () => {
  replies = [{ status: 413, text: "Request Entity Too Large" }];

  await saveOnePhoto();

  await expect.element(toast(PHOTO_TOO_LARGE_MESSAGE)).toBeVisible();
  expect(sent).toHaveLength(1);
});

// What the guide tells staff to do after a failure: press Save again.
test("Save after a failure sends the photo again", async () => {
  replies = [
    { status: 500, body: { error: "Upload failed." } },
    { status: 201, body: { url: "https://example.test/a.webp" } },
  ];

  await saveOnePhoto();
  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  // The keyboard is back on the crop box, so Enter saves again.
  await expect.element(cropBox()).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent).toHaveLength(2);
  expect(routerCalls).toEqual([{ method: "refresh", href: "" }]);
});

// A HEIC photo outside Safari, a PDF: nothing to crop, so it isn't added.
test("a file the browser can't open is refused by name, and nothing is sent", async () => {
  const { add } = await renderUploader();

  await add(unreadablePhoto());

  await expect.element(toast(UNREADABLE_PHOTO_MESSAGE)).toBeVisible();
  await expect.element(toast("rex.heic")).toBeVisible();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent).toEqual([]);
});

test("a photo added after a refused one is cropped and sent", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/a.webp" } }];
  const { add } = await renderUploader();
  await add(unreadablePhoto());
  await expect.element(toast(UNREADABLE_PHOTO_MESSAGE)).toBeVisible();

  await add(await photoFile());
  await expect.element(cropBox()).toBeVisible();
  await saveButton().click();

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  expect(toast(UNREADABLE_PHOTO_MESSAGE).all()).toHaveLength(1);
  expect(sent.map(({ file }) => file.name)).toEqual(["charlie.webp"]);
});

test("a refused file doesn't stop the photos added with it", async () => {
  const { add } = await renderUploader();

  await add(unreadablePhoto(), await photoFile());

  await expect.element(toast(UNREADABLE_PHOTO_MESSAGE)).toBeVisible();
  await expect.element(cropBox()).toBeVisible();
  await expect.element(listed("charlie.png")).toBeVisible();
  await expect.element(listed("rex.heic")).not.toBeInTheDocument();
});

test("photos added together are each cropped and saved in turn", async () => {
  replies = [
    { status: 201, body: { url: "https://example.test/a.webp" } },
    { status: 201, body: { url: "https://example.test/b.webp" } },
  ];
  await addPhotos(await photoFile("a.png"), await photoFile("b.png"));
  expect(dialog().element().textContent).toContain("Photo 1 of 2.");
  await expect.element(listed("a.png")).toHaveAttribute("aria-current", "true");

  await saveButton().click();

  // The first is ticked, and the second is up.
  await expect.element(listed("b.png")).toHaveAttribute("aria-current", "true");
  await expect.element(listed("a.png Saved")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Remove a.png" }))
    .not.toBeInTheDocument();

  await saveButton().click();

  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent.map(({ file }) => file.name)).toEqual(["a.webp", "b.webp"]);
  expect(routerCalls).toHaveLength(2);
});

test("J and K move through the batch and Enter saves, as soon as it opens", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/b.webp" } }];
  await addPhotos(await photoFile("a.png"), await photoFile("b.png"));
  // No click first: the crop box has the keyboard.
  await expect.element(cropBox()).toHaveFocus();

  await userEvent.keyboard("j");
  await expect.element(listed("b.png")).toHaveAttribute("aria-current", "true");
  await userEvent.keyboard("k");
  await expect.element(listed("a.png")).toHaveAttribute("aria-current", "true");
  await userEvent.keyboard("j");
  await expect.element(cropBox()).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  expect(sent.map(({ file }) => file.name)).toEqual(["b.webp"]);
  await expect.element(listed("a.png")).toHaveAttribute("aria-current", "true");
});

test("J, K and Enter on a focused wide preview leave the batch alone", async () => {
  await addPhotos(await photoFile("a.png"), await photoFile("b.png"));
  const pagePreview = page.getByRole("slider", { name: "Framing: Animal's page" });
  await pagePreview.click();
  await expect.element(pagePreview).toHaveFocus();

  await userEvent.keyboard("jk{Enter}");
  await new Promise((resolve) => setTimeout(resolve, 50));

  await expect.element(listed("a.png")).toHaveAttribute("aria-current", "true");
  await expect.element(pagePreview).toHaveFocus();
  expect(sent).toEqual([]);
});

test("a photo removed from the batch isn't sent", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/b.webp" } }];
  await addPhotos(await photoFile("a.png"), await photoFile("b.png"));

  await page.getByRole("button", { name: "Remove a.png" }).click();

  await expect.element(listed("a.png")).not.toBeInTheDocument();
  await expect.element(listed("b.png")).toHaveAttribute("aria-current", "true");
  await saveButton().click();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent.map(({ file }) => file.name)).toEqual(["b.webp"]);
});

test("closing with photos not saved asks first", async () => {
  await addPhotos(await photoFile("a.png"));

  await userEvent.keyboard("{Escape}");
  const confirm = page.getByRole("alertdialog", {
    name: "Discard the photos you haven't saved?",
  });
  await expect.element(confirm).toBeVisible();
  expect(confirm.element().textContent).toContain("1 photo hasn't been saved.");
  await confirm.getByRole("button", { name: "Keep cropping" }).click();
  await expect.element(dialog()).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Discard" }).click();

  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent).toEqual([]);
});

test("the list shows small thumbnails, not the photos at full size", async () => {
  await addPhotos(
    await photoFile("IMG_0042.JPG", { width: 4000, height: 3000, type: "image/jpeg" }),
  );

  const thumbnail = page
    .getByRole("list", { name: "Photos to crop" })
    .element()
    .querySelector("img")!;
  await expect.poll(() => thumbnail.naturalWidth).toBe(72);
  expect(thumbnail.naturalHeight).toBe(72);
});

/**
 * A JPEG stored on its side with EXIF orientation 6 ("turn 90° clockwise to
 * show"), as a phone saves a portrait photo: stored 400 × 200 with a red
 * left half and a blue right half, so it shows 200 × 400, red on top.
 */
async function sidewaysPhoto(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 200;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f00";
  context.fillRect(0, 0, 200, 200);
  context.fillStyle = "#00f";
  context.fillRect(200, 0, 200, 200);
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.95),
  );
  const bytes = new Uint8Array(await jpeg!.arrayBuffer());
  // An APP1 Exif segment holding one tag, Orientation (0x0112) = 6, put
  // straight after the JPEG's start marker.
  const exif = new Uint8Array([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian TIFF, IFD at 8
    0x01, 0x00, // one entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const withExif = new Uint8Array(bytes.length + exif.length);
  withExif.set(bytes.subarray(0, 2), 0);
  withExif.set(exif, 2);
  withExif.set(bytes.subarray(2), 2 + exif.length);
  return new File([withExif], "portrait.jpg", { type: "image/jpeg" });
}

// The box is drawn over the photo as shown (upright), so the saved pixels
// must be the upright photo's too.
test("a phone's portrait photo, stored on its side, is cropped as it is shown", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/p.webp" } }];
  await addPhotos(await sidewaysPhoto());

  // Upright it is 200 × 400: the crop starts as the 200px square in the
  // middle, and the photo is drawn taller than wide.
  await expect.element(cropBox()).toHaveAttribute("data-crop", "0,100,200");
  const shown = page.getByTestId("crop-stage").element().querySelector("img")!;
  expect(shown.clientHeight).toBeGreaterThan(shown.clientWidth);

  // To the bottom: the blue half. (Saved from the photo as stored, this
  // square would be off its edge, and come out white.)
  await userEvent.keyboard(
    "{Shift>}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{/Shift}",
  );
  await expect.element(cropBox()).toHaveAttribute("data-crop", "0,200,200");
  await saveButton().click();

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  const [{ file }] = sent;
  for (const [x, y] of [[5, 10], [195, 10], [5, 195], [195, 195], [100, 100]]) {
    expect(near(await colourAt(file, x, y), [0, 0, 255])).toBe(true);
  }
});

test("moving to another photo while one is saving keeps the view, and ticks the right one", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/a.webp" } }];
  await addPhotos(
    await photoFile("a.png"),
    await photoFile("b.png"),
    await photoFile("c.png"),
  );
  const release = holdAnswers();
  await saveButton().click();
  await expect.element(page.getByRole("button", { name: "Saving…" })).toBeDisabled();

  await listed("c.png").click();
  release();

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  await expect.element(listed("a.png Saved")).toBeVisible();
  // Staff picked c while a was saving: they stay on c.
  await expect.element(listed("c.png")).toHaveAttribute("aria-current", "true");
  expect(sent.map(({ file }) => file.name)).toEqual(["a.webp"]);
});

test("a photo is sent once, however Save is pressed, and the box can't close meanwhile", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/a.webp" } }];
  await addPhotos(await photoFile("a.png"), await photoFile("b.png"));
  const release = holdAnswers();

  await saveButton().dblClick();
  await userEvent.keyboard("{Enter}{Enter}");
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
  await expect.element(dialog()).toBeVisible();
  release();

  await expect.element(toast(PHOTO_SAVED_MESSAGE)).toBeVisible();
  await expect.element(listed("b.png")).toHaveAttribute("aria-current", "true");
  expect(sent).toHaveLength(1);
});

test("photos dropped on the box open to crop", async () => {
  await renderUploader();
  const drop = new DataTransfer();
  drop.items.add(await photoFile("dropped.png"));
  drop.items.add(unreadablePhoto());

  page
    .getByText("Drop photos here", { exact: false })
    .element()
    .parentElement!.dispatchEvent(
      new DragEvent("drop", { dataTransfer: drop, bubbles: true, cancelable: true }),
    );

  await expect.element(cropBox()).toBeVisible();
  await expect.element(listed("dropped.png")).toBeVisible();
  await expect.element(toast(UNREADABLE_PHOTO_MESSAGE)).toBeVisible();
});

// The second click lands on the disabled Save button, which puts the
// keyboard on the dialog's panel, not on the page.
test("after a double-clicked Save fails, the arrow keys move the crop again", async () => {
  replies = [{ status: 500, body: { error: "Upload failed." } }];
  await addPhotos(await photoFile());
  const start = cropBox().element().getAttribute("data-crop");

  await saveButton().dblClick();

  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  await expect.element(cropBox()).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(cropBox()).not.toHaveAttribute("data-crop", start!);
  expect(sent).toHaveLength(1);
});

test("a transparent PNG's thumbnail is on white, as it is saved", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  const context = canvas.getContext("2d")!;
  // Transparent, with a red square in the middle.
  context.fillStyle = "#f00";
  context.fillRect(50, 50, 100, 100);
  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  await addPhotos(new File([png!], "cut-out.png", { type: "image/png" }));

  const thumbnail = page
    .getByRole("list", { name: "Photos to crop" })
    .element()
    .querySelector("img")!;
  const blob = await (await fetch(thumbnail.src)).blob();
  expect(near(await colourAt(blob, 2, 2), [255, 255, 255])).toBe(true);
  expect(near(await colourAt(blob, 36, 36), [255, 0, 0])).toBe(true);
});

/** Spies on object URLs: the ones made, and the ones let go. */
function watchObjectUrls() {
  const made: string[] = [];
  const revoked: string[] = [];
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  vi.spyOn(URL, "createObjectURL").mockImplementation((object) => {
    const url = create(object);
    made.push(url);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
    revoked.push(url);
    revoke(url);
  });
  return { made, kept: () => made.filter((url) => !revoked.includes(url)) };
}

test("leaving the page mid-batch lets go of every photo's URLs", async () => {
  const urls = watchObjectUrls();
  await addPhotos(await photoFile("a.png"), await photoFile("b.png"));
  expect(urls.made.length).toBeGreaterThan(0);

  await cleanup();

  expect(urls.kept()).toEqual([]);
});

test("leaving the page while photos are opening lets go of what they made", async () => {
  const urls = watchObjectUrls();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const decode = HTMLImageElement.prototype.decode;
  vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(async function (
    this: HTMLImageElement,
  ) {
    await held;
    return decode.call(this);
  });
  const { add } = await renderUploader();
  await add(await photoFile("a.png"), await photoFile("b.png"));
  await expect.element(page.getByText("Opening photos…")).toBeVisible();

  await cleanup();
  release();

  await expect.poll(() => urls.made.length).toBeGreaterThan(1);
  await expect.poll(urls.kept).toEqual([]);
});

test("staff without permission see that uploading is disabled", async () => {
  await render(<PhotoUploader animalId="animal-1" canManage={false} />);

  await expect.element(page.getByText("Uploading is disabled")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Choose photos" }))
    .not.toBeInTheDocument();
});

test("each photo keeps its own framing, and only a framed one sends it", async () => {
  replies = [
    { status: 201, body: { url: "https://example.test/a.webp" } },
    { status: 201, body: { url: "https://example.test/b.webp" } },
  ];
  await addPhotos(await photoFile("a.png"), await photoFile("b.png"));
  const pagePreview = page.getByRole("slider", { name: "Framing: Animal's page" });

  // The first framed to the top; the second left centred.
  await pagePreview.click();
  await userEvent.keyboard("{Home}");
  await expect.element(pagePreview).toHaveAttribute("aria-valuetext", "Top");
  await listed("b.png").click();
  await expect.element(pagePreview).toHaveAttribute("aria-valuetext", "Centred");
  await listed("a.png").click();
  await expect.element(pagePreview).toHaveAttribute("aria-valuetext", "Top");

  await saveButton().click();
  await expect.element(listed("b.png")).toHaveAttribute("aria-current", "true");
  await saveButton().click();

  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent.map(({ file, focusY }) => [file.name, focusY])).toEqual([
    ["a.webp", "0"],
    ["b.webp", null],
  ]);
});
