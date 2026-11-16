import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { toast as sonner, Toaster } from "sonner";
import UppyUploader from "@/components/dashboard/animals/photos/uppy-uploader";
import {
  UPLOAD_FAILED_MESSAGE,
  UPLOAD_UNREACHABLE_MESSAGE,
} from "@/components/dashboard/animals/photos/upload-errors";
import {
  MAX_PHOTO_BYTES,
  PHOTO_TOO_LARGE_MESSAGE,
  SHRUNK_PHOTO_LONGEST_SIDE,
} from "@/app/lib/storage/photo-size";
import { resetNavigation, routerCalls } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The Photos tab's uploader against a stand-in for /api/upload-to-blob. Uppy
// sends each upload with XMLHttpRequest, so the test swaps in a fake one that
// answers from `replies`: no request leaves the page, and nothing reaches the
// Vercel Blob store. Everything between the file input and the toast is the
// real Uppy, so these cover what it does with each answer: before the fix,
// every failure, a 403 included, was retried three times and toasted Uppy's
// "This looks like a network error…". A retry the test didn't expect asks for
// a reply that isn't there, and the run fails on that error.

// `text` is a body that isn't JSON, such as a platform's error page.
type Reply = { status: number; body?: unknown; text?: string } | "no answer";

let replies: Reply[] = [];
let requests: string[] = [];
// The file each request carried.
let sentFiles: File[] = [];

class FakeXMLHttpRequest {
  status = 0;
  statusText = "";
  readyState = 0;
  responseType = "";
  response: unknown = null;
  responseText = "";
  withCredentials = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #url = "";

  open(_method: string, url: string) {
    this.#url = url;
  }
  setRequestHeader() {}
  abort() {}
  send(body: FormData) {
    requests.push(this.#url);
    sentFiles.push(body.get("file") as File);
    const reply = replies.shift();
    if (!reply) throw new Error(`No reply left for request ${requests.length}`);
    setTimeout(() => {
      this.readyState = 4;
      if (reply === "no answer") {
        this.onerror?.();
        return;
      }
      this.status = reply.status;
      this.responseText = reply.text ?? JSON.stringify(reply.body ?? {});
      this.onload?.();
    });
  }
}

beforeEach(() => {
  replies = [];
  requests = [];
  sentFiles = [];
  resetNavigation("/dashboard/animals/animal-1/photos");
  vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
});

// Sonner keeps its toasts in module state, and a new <Toaster> shows the ones
// still there: without dismissing them, a toast from the test before passes
// this test's check before its own upload has even been answered.
afterEach(async () => {
  await cleanup();
  sonner.dismiss();
  vi.unstubAllGlobals();
});

const smallPhoto = (name = "charlie.jpg") =>
  new File(["not really a photo"], name, { type: "image/jpeg" });

/** Shows the uploader; the function it returns adds files to it. */
async function renderUploader() {
  const screen = await render(
    <>
      <UppyUploader animalId="animal-1" canManage />
      <Toaster />
    </>,
  );
  const add = (...photos: File[]) => {
    // The input behind "browse files" (not the one for folders). Found each
    // time: the Dashboard draws a new one when its box empties.
    const input = Array.from(
      screen.container.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    ).find((element) => !element.webkitdirectory);
    if (!input) throw new Error("The uploader has no file input");
    return userEvent.upload(page.elementLocator(input), photos);
  };
  /** The "Remove file" button on the file called `name`. */
  const removeButton = (name: string) => {
    const item = Array.from(
      screen.container.querySelectorAll(".uppy-Dashboard-Item"),
    ).find((element) => element.textContent?.includes(name));
    if (!item) throw new Error(`The uploader doesn't show ${name}`);
    return page
      .elementLocator(item)
      .getByRole("button", { name: "Remove file" });
  };
  return { add, removeButton };
}

async function uploadPhoto(photo: File = smallPhoto()) {
  const { add } = await renderUploader();
  await add(photo);
}

/** A file over 4 MB that no browser can open as an image. */
const unreadablePhoto = (name = "rex.heic") =>
  new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], name, {
    type: "image/heic",
  });

/**
 * Holds every photo being made smaller until the returned `release` is
 * called, so a test can act while one is being shrunk.
 */
function holdShrinking() {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const decode = globalThis.createImageBitmap.bind(globalThis);
  vi.stubGlobal("createImageBitmap", async (image: Blob) => {
    await held;
    return decode(image);
  });
  return release;
}

/**
 * A 4000 × 3000 JPEG of about 7.6 MB, like a phone photo: a gradient with
 * fixed noise, which JPEG can't squeeze at this quality.
 */
async function bigPhoto(name: string): Promise<File> {
  const width = 4000;
  const height = 3000;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  const image = context.createImageData(width, height);
  let seed = 1;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const noise = ((seed >> 8) % 81) - 40;
    const pixel = i / 4;
    image.data[i] = ((pixel % width) * 255) / width + noise;
    image.data[i + 1] = (Math.floor(pixel / width) * 255) / height + noise;
    image.data[i + 2] = 128 + noise;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.95),
  );
  if (!blob) throw new Error("Couldn't make the photo");
  return new File([blob], name, { type: "image/jpeg" });
}

const toast = (text: string) => page.getByText(text, { exact: true });

test("a refusal shows the route's reason", async () => {
  replies = [
    {
      status: 403,
      body: { error: "Forbidden: You do not have permission to upload files." },
    },
  ];

  await uploadPhoto();

  await expect
    .element(toast("Forbidden: You do not have permission to upload files."))
    .toBeVisible();
  expect(requests).toEqual(["/api/upload-to-blob"]);
});

test("a refusal without a reason shows the general message", async () => {
  replies = [{ status: 400, body: {} }];

  await uploadPhoto();

  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("a server failure shows the general message, without retrying", async () => {
  replies = [{ status: 500, body: { error: "Upload failed." } }];

  await uploadPhoto();

  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("no answer at all says the server couldn't be reached", async () => {
  replies = ["no answer"];

  await uploadPhoto();

  await expect.element(toast(UPLOAD_UNREACHABLE_MESSAGE)).toBeVisible();
  expect(requests).toHaveLength(1);
});

// What the guide tells staff to do: the failed file stays in the uploader,
// and its Retry button sends it again. Adding the same file again is refused
// as a duplicate.
test("Retry sends a failed upload again", async () => {
  replies = [
    { status: 500, body: { error: "Upload failed." } },
    { status: 201, body: { url: "https://example.test/charlie.jpg" } },
  ];

  await uploadPhoto();
  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  // Uppy's status bar: "Upload failed", and the Retry button.
  const retry = page.getByRole("button", { name: "Retry upload" });
  await expect.element(retry).toBeVisible();

  await retry.click();

  await expect.element(toast("Image uploaded successfully!")).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(routerCalls).toEqual([{ method: "refresh", href: "" }]);
});

// Vercel refuses a request body over 4.5 MB before the route sees it, and
// phone photos are often bigger. The uploader sends a smaller copy instead.
test("a photo over 4 MB is sent as a smaller JPEG", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/rex.jpg" } }];
  const photo = await bigPhoto("rex.jpeg");
  expect(photo.size).toBeGreaterThan(MAX_PHOTO_BYTES);

  await uploadPhoto(photo);

  await expect.element(toast("Image uploaded successfully!")).toBeVisible();
  expect(requests).toEqual(["/api/upload-to-blob"]);
  const [sent] = sentFiles;
  expect(sent.name).toBe("rex.jpg");
  expect(sent.type).toBe("image/jpeg");
  expect(sent.size).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
  const bitmap = await createImageBitmap(sent);
  expect([bitmap.width, bitmap.height]).toEqual([
    SHRUNK_PHOTO_LONGEST_SIDE,
    (SHRUNK_PHOTO_LONGEST_SIDE * 3) / 4,
  ]);
  bitmap.close();
});

test("a photo under 4 MB is sent as it is", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/charlie.png" } }];
  const photo = new File(["a small photo"], "charlie.png", {
    type: "image/png",
  });

  await uploadPhoto(photo);

  await expect.element(toast("Image uploaded successfully!")).toBeVisible();
  const [sent] = sentFiles;
  expect(sent.name).toBe("charlie.png");
  expect(sent.type).toBe("image/png");
  expect(await sent.text()).toBe("a small photo");
});

// A file the browser can't open (a HEIC photo outside Safari, say) can't be
// made smaller, so it is refused before it is sent: Vercel would refuse it.
// Retry could never send it, so it leaves the box: Uppy retries every failed
// file whenever another is added, which would refuse it again each time.
test("a photo over 4 MB that can't be made smaller isn't sent, and leaves the box", async () => {
  await uploadPhoto(unreadablePhoto());

  await expect.element(toast(PHOTO_TOO_LARGE_MESSAGE)).toBeVisible();
  // The toast names the photo; the box no longer holds it.
  await expect.element(page.getByText("rex.heic", { exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Remove file" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Retry upload" }))
    .not.toBeInTheDocument();
  expect(requests).toEqual([]);
});

test("a photo added after a refused one is sent, without refusing the first again", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/charlie.jpg" } }];
  const { add } = await renderUploader();
  await add(unreadablePhoto());
  await expect.element(toast(PHOTO_TOO_LARGE_MESSAGE)).toBeVisible();

  await add(smallPhoto());

  await expect.element(toast("Image uploaded successfully!")).toBeVisible();
  expect(toast(PHOTO_TOO_LARGE_MESSAGE).all()).toHaveLength(1);
  expect(sentFiles.map((file) => file.name)).toEqual(["charlie.jpg"]);
});

test("photos added together are each sent, the big one made smaller", async () => {
  replies = [
    { status: 201, body: { url: "https://example.test/rex.jpg" } },
    { status: 201, body: { url: "https://example.test/charlie.jpg" } },
  ];
  const { add } = await renderUploader();

  await add(await bigPhoto("rex.jpeg"), smallPhoto());

  await expect
    .poll(() => sentFiles.map((file) => file.name).sort())
    .toEqual(["charlie.jpg", "rex.jpg"]);
  for (const file of sentFiles) {
    expect(file.size).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
  }
});

test("a refused photo doesn't stop the others added with it", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/charlie.jpg" } }];
  const { add } = await renderUploader();

  await add(unreadablePhoto(), smallPhoto());

  await expect.element(toast(PHOTO_TOO_LARGE_MESSAGE)).toBeVisible();
  await expect.element(toast("Image uploaded successfully!")).toBeVisible();
  expect(sentFiles.map((file) => file.name)).toEqual(["charlie.jpg"]);
});

// Before the fix, the shrinking step failed on the removed photo, and Uppy
// dropped the whole batch: the other photo was never sent, and nothing said so.
test("removing a photo while it is made smaller still sends the others", async () => {
  replies = [{ status: 201, body: { url: "https://example.test/charlie.jpg" } }];
  const release = holdShrinking();
  const { add, removeButton } = await renderUploader();
  await add(await bigPhoto("rex.jpeg"), smallPhoto());
  await expect
    .element(page.getByText("Making the photo smaller…"))
    .toBeVisible();

  await removeButton("rex.jpeg").click();
  release();

  await expect.element(toast("Image uploaded successfully!")).toBeVisible();
  expect(sentFiles.map((file) => file.name)).toEqual(["charlie.jpg"]);
});

// Vercel's own refusal, with an error page rather than the route's JSON.
test("a 413 from the platform says the photo is too big", async () => {
  replies = [{ status: 413, text: "Request Entity Too Large" }];

  await uploadPhoto();

  await expect.element(toast(PHOTO_TOO_LARGE_MESSAGE)).toBeVisible();
  expect(requests).toHaveLength(1);
});
