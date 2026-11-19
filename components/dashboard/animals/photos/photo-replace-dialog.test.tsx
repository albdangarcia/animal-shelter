import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { toast as sonner, Toaster } from "sonner";
import {
  PHOTO_REPLACED_MESSAGE,
  PHOTO_REPLACE_ENDPOINT,
  usePhotoReplacer,
  type ReplaceablePhoto,
} from "@/components/dashboard/animals/photos/photo-replace-dialog";
import {
  UNREADABLE_REPLACEMENT_MESSAGE,
  UPLOAD_UNREACHABLE_MESSAGE,
} from "@/components/dashboard/animals/photos/upload-errors";
import { resetNavigation, routerCalls } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// Opening the photo named `held.name` waits for `held.open()`, so another can
// be chosen, or the page left, while it is still opening. Every other photo
// opens as it would.
const held = vi.hoisted(() => ({ name: "", gate: Promise.resolve(), open: () => {} }));
vi.mock("@/components/dashboard/animals/photos/crop-photo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/dashboard/animals/photos/crop-photo")>();
  return {
    ...actual,
    openPhoto: async (file: Blob) => {
      const opened = await actual.openPhoto(file);
      if (file instanceof File && file.name === held.name) await held.gate;
      return opened;
    },
  };
});

/** Object URLs made and not yet let go of, from here on. */
function liveObjectUrls() {
  const create = vi.spyOn(URL, "createObjectURL");
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  return () => {
    const revoked = new Set(revoke.mock.calls.map(([url]) => url));
    return create.mock.results.map(({ value }) => value as string).filter((url) => !revoked.has(url));
  };
}

/** Lets the event loop run: what a photo that has opened does next. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

// Replacing a saved photo: a tile's Replace button (here a stand-in, as the
// gallery imports server actions) opens the file chooser, the chosen photo
// opens in the crop editor, and saving sends the crop to a stand-in for
// POST /api/animal-photos/replace with the photo it replaces. As in the
// uploader's tests, `fetch` answers only that address from `replies`, and
// the browser really decodes and crops each photo. The rules (same row,
// stale photos, files) are in prisma/animal-photos.test.ts.

type Reply = { status: number; body?: unknown; after?: Promise<void> } | "no answer";

let replies: Reply[] = [];
let sent: { file: File; animalId: string; imageId: string; expectedUrl: string }[] = [];
let unexpected: string[] = [];

const SAVED: ReplaceablePhoto = { id: "image-1", url: "/old-photo.webp" };

beforeEach(async () => {
  held.name = "";
  held.gate = new Promise((resolve) => {
    held.open = resolve;
  });
  replies = [];
  sent = [];
  unexpected = [];
  resetNavigation("/dashboard/animals/animal-1/photos");
  await page.viewport(1100, 900);
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== PHOTO_REPLACE_ENDPOINT) return realFetch(input, init);
    const form = init?.body as FormData;
    sent.push({
      file: form.get("file") as File,
      animalId: String(form.get("animalId")),
      imageId: String(form.get("imageId")),
      expectedUrl: String(form.get("expectedUrl")),
    });
    const reply = replies.shift();
    if (!reply) {
      unexpected.push(`request ${sent.length}`);
      return new Response(null, { status: 599 });
    }
    if (reply === "no answer") throw new TypeError("Failed to fetch");
    await reply.after;
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  });
});

afterEach(async () => {
  await cleanup();
  sonner.dismiss();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(unexpected).toEqual([]);
});

/** Quarters of red, green, blue and yellow, as in the uploader's tests. */
async function photoFile(name = "charlie.png", size = 400): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  ["#f00", "#0f0", "#00f", "#ff0"].forEach((colour, index) => {
    context.fillStyle = colour;
    context.fillRect((index % 2) * (size / 2), Math.floor(index / 2) * (size / 2), size / 2, size / 2);
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't make the photo");
  return new File([blob], name, { type: "image/png" });
}

function Gallery({ image }: { image: ReplaceablePhoto }) {
  const { choose, element } = usePhotoReplacer("animal-1");
  return (
    <>
      <button type="button" onClick={() => choose(image)}>
        Replace this photo
      </button>
      {element}
    </>
  );
}

const dialog = () => page.getByRole("dialog", { name: "Replace photo" });
const cropBox = () => page.getByTestId("crop-box");
const replaceButton = () => page.getByRole("button", { name: "Replace photo", exact: true });
const toast = (text: string) => page.getByText(text, { exact: true });

/** Clicks the tile's Replace and chooses `file` in the file chooser. */
async function replaceWith(file: File, image = SAVED) {
  await render(
    <>
      <Gallery image={image} />
      <Toaster />
    </>,
  );
  await page.getByRole("button", { name: "Replace this photo" }).click();
  await userEvent.upload(page.getByTestId("replace-photo-file-input"), file);
}

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

test("the chosen photo opens to crop, beside the photo it replaces", async () => {
  await replaceWith(await photoFile());

  await expect.element(dialog()).toBeVisible();
  await expect.element(cropBox()).toHaveAttribute("data-crop", "20,20,360");
  await expect
    .element(page.getByRole("img", { name: "The photo being replaced" }))
    .toHaveAttribute("src", SAVED.url);
  expect(sent).toEqual([]);
});

test("Replace photo sends the cropped square with the photo it replaces, then closes", async () => {
  replies = [{ status: 200, body: { url: "https://example.test/new.webp" } }];
  await replaceWith(await photoFile());

  // The smallest crop, moved into the top-right corner: the green quarter.
  await page.getByRole("slider", { name: "Zoom" }).click();
  await userEvent.keyboard("{End}");
  await cropBox().click();
  await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowUp}{ArrowUp}{ArrowUp}{/Shift}");
  await expect.element(cropBox()).toHaveAttribute("data-crop", "200,0,200");
  await replaceButton().click();

  await expect.element(toast(PHOTO_REPLACED_MESSAGE)).toBeVisible();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent).toHaveLength(1);
  const [{ file, animalId, imageId, expectedUrl }] = sent;
  expect({ animalId, imageId, expectedUrl }).toEqual({
    animalId: "animal-1",
    imageId: SAVED.id,
    expectedUrl: SAVED.url,
  });
  expect(file.type).toBe("image/webp");
  const bitmap = await createImageBitmap(file);
  expect([bitmap.width, bitmap.height]).toEqual([200, 200]);
  bitmap.close();
  for (const [x, y] of [[5, 5], [195, 195], [100, 100]]) {
    expect(near(await colourAt(file, x, y), [0, 255, 0])).toBe(true);
  }
  expect(routerCalls).toEqual([{ method: "refresh", href: "" }]);
});

test("a refusal shows the route's reason and stays open, and Replace photo sends again", async () => {
  const changed =
    "This photo has changed since you opened the page. It may have been replaced in another tab. Reload the page and try again.";
  replies = [
    { status: 409, body: { error: changed } },
    { status: 200, body: { url: "https://example.test/new.webp" } },
  ];
  await replaceWith(await photoFile());

  await replaceButton().click();
  await expect.element(toast(changed)).toBeVisible();
  await expect.element(dialog()).toBeVisible();
  // The keyboard is back on the square, as when the box opened.
  await expect.element(cropBox()).toHaveFocus();
  expect(sent).toHaveLength(1);
  expect(routerCalls).toEqual([]);

  await replaceButton().click();
  await expect.element(toast(PHOTO_REPLACED_MESSAGE)).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(routerCalls).toEqual([{ method: "refresh", href: "" }]);
});

test("no answer at all says the server couldn't be reached, and the photo stays open", async () => {
  replies = ["no answer"];
  await replaceWith(await photoFile());

  await replaceButton().click();

  await expect.element(toast(UPLOAD_UNREACHABLE_MESSAGE)).toBeVisible();
  await expect.element(dialog()).toBeVisible();
  expect(sent).toHaveLength(1);
});

test("Enter replaces the photo as soon as it opens", async () => {
  replies = [{ status: 200, body: { url: "https://example.test/new.webp" } }];
  await replaceWith(await photoFile());
  await expect.element(cropBox()).toHaveFocus();

  await userEvent.keyboard("{Enter}");

  await expect.element(toast(PHOTO_REPLACED_MESSAGE)).toBeVisible();
  expect(sent).toHaveLength(1);
});

test("a double click sends the photo once", async () => {
  replies = [{ status: 200, body: { url: "https://example.test/new.webp" } }];
  await replaceWith(await photoFile());

  await replaceButton().dblClick();

  await expect.element(toast(PHOTO_REPLACED_MESSAGE)).toBeVisible();
  expect(sent).toHaveLength(1);
});

test("Esc and Cancel close without sending anything", async () => {
  await replaceWith(await photoFile());
  await expect.element(cropBox()).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog()).not.toBeInTheDocument();

  await page.getByRole("button", { name: "Replace this photo" }).click();
  await userEvent.upload(page.getByTestId("replace-photo-file-input"), await photoFile());
  await expect.element(cropBox()).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect.element(dialog()).not.toBeInTheDocument();

  expect(sent).toEqual([]);
  expect(routerCalls).toEqual([]);
});

test("a file the browser can't open is refused by name, and nothing opens", async () => {
  await replaceWith(new File(["not really a photo"], "rex.heic", { type: "image/heic" }));

  await expect.element(page.getByText(UNREADABLE_REPLACEMENT_MESSAGE)).toBeVisible();
  await expect.element(page.getByText("rex.heic")).toBeVisible();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent).toEqual([]);
});

test("while the photo is being replaced, Enter doesn't send it again and Esc doesn't close the box", async () => {
  let answer = () => {};
  replies = [
    {
      status: 200,
      body: { url: "https://example.test/new.webp" },
      after: new Promise((resolve) => {
        answer = resolve;
      }),
    },
  ];
  await replaceWith(await photoFile());

  await replaceButton().click();
  await expect.element(page.getByRole("button", { name: "Replacing…" })).toBeDisabled();
  (cropBox().element() as HTMLElement).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard("{Escape}");
  await settle();
  await expect.element(dialog()).toBeVisible();

  answer();
  await expect.element(toast(PHOTO_REPLACED_MESSAGE)).toBeVisible();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(sent).toHaveLength(1);
});

test("a photo chosen while another is still opening is the one that opens, and the other is let go of", async () => {
  const OTHER: ReplaceablePhoto = { id: "image-2", url: "/other-photo.webp" };
  function TwoTiles() {
    const { choose, element } = usePhotoReplacer("animal-1");
    return (
      <>
        <button type="button" onClick={() => choose(SAVED)}>
          Replace the first photo
        </button>
        <button type="button" onClick={() => choose(OTHER)}>
          Replace the second photo
        </button>
        {element}
      </>
    );
  }
  const live = liveObjectUrls();
  held.name = "slow.png";
  await render(<TwoTiles />);
  const input = page.getByTestId("replace-photo-file-input");

  await page.getByRole("button", { name: "Replace the first photo" }).click();
  await userEvent.upload(input, await photoFile("slow.png"));
  await page.getByRole("button", { name: "Replace the second photo" }).click();
  await userEvent.upload(input, await photoFile("quick.png"));
  const now = page.getByRole("img", { name: "The photo being replaced" });
  await expect.element(now).toHaveAttribute("src", OTHER.url);

  // The first photo finishes opening after the second: it doesn't take over.
  held.open();
  await settle();
  await expect.element(now).toHaveAttribute("src", OTHER.url);

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(live()).toEqual([]);
});

test("a photo still opening when the page is left is let go of", async () => {
  const live = liveObjectUrls();
  held.name = "slow.png";
  await replaceWith(await photoFile("slow.png"));

  await cleanup();
  held.open();
  await settle();

  expect(live()).toEqual([]);
});
