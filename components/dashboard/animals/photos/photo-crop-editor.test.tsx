import { afterEach, beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { useState } from "react";
import PhotoCropEditor, {
  type CropPhoto,
} from "@/components/dashboard/animals/photos/photo-crop-editor";
import type { Crop } from "@/app/lib/utils/photo-crop";

// The crop editor on its own: what a drag, a key, the slider and the wheel
// do to the crop, which the editor reports and the test keeps, as the
// uploader does. The rules themselves (edges, minimum, steps) are unit-tested
// in app/lib/utils/photo-crop.test.ts; these show the editor is wired to
// them. The photo is 400 × 300 and shown at its own size, so a pixel on
// screen is a pixel of the photo.

const WIDTH = 400;
const HEIGHT = 300;

let photo: CropPhoto;

/** A plain PNG, 400 × 300 unless asked otherwise, as an object URL. */
async function makePhoto(width = WIDTH, height = HEIGHT): Promise<CropPhoto> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  context.fillStyle = "#4a7";
  context.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Couldn't make the photo");
  return { src: URL.createObjectURL(blob), width, height };
}

beforeEach(async () => {
  await page.viewport(1000, 800);
  photo = await makePhoto();
});

afterEach(async () => {
  await cleanup();
  URL.revokeObjectURL(photo.src);
});

function Harness({ start, autoFocus }: { start: Crop; autoFocus?: boolean }) {
  const [crop, setCrop] = useState(start);
  return (
    <PhotoCropEditor
      photo={photo}
      crop={crop}
      onCropChange={setCrop}
      autoFocus={autoFocus}
    />
  );
}

const box = () => page.getByTestId("crop-box");

/** The crop the editor is showing, read from its box. */
async function shownCrop(): Promise<Crop> {
  await expect.element(box()).toBeVisible();
  const [x, y, size] = (box().element().getAttribute("data-crop") ?? "")
    .split(",")
    .map(Number);
  return { x, y, size };
}

async function renderEditor(
  start: Crop = { x: 100, y: 50, size: 200 },
  autoFocus = false,
) {
  await render(<Harness start={start} autoFocus={autoFocus} />);
  await expect.element(box()).toBeVisible();
}

test("the box is drawn over the crop", async () => {
  await renderEditor();

  const image = page.getByTestId("crop-stage").element().querySelector("img")!;
  const stage = image.getBoundingClientRect();
  const rect = box().element().getBoundingClientRect();
  expect(stage.width).toBe(WIDTH);
  expect(rect.left - stage.left).toBe(100);
  expect(rect.top - stage.top).toBe(50);
  expect(rect.width).toBe(200);
});

test("dragging the box moves it, and it stops at the photo's edge", async () => {
  await renderEditor();

  // From the box's middle (200, 150) to (230, 130): 30 right, 20 up.
  await userEvent.dragAndDrop(box(), page.getByTestId("crop-stage"), {
    targetPosition: { x: 230, y: 130 },
  });
  expect(await shownCrop()).toEqual({ x: 130, y: 30, size: 200 });

  // Far past the top-left corner.
  await userEvent.dragAndDrop(box(), page.getByTestId("crop-stage"), {
    targetPosition: { x: 5, y: 5 },
  });
  expect(await shownCrop()).toEqual({ x: 0, y: 0, size: 200 });
});

test("dragging the corner resizes the box and keeps its top-left corner", async () => {
  await renderEditor({ x: 50, y: 20, size: 200 });
  const handle = page.getByTestId("crop-stage").element().querySelector("[data-crop-handle]")!;

  // The handle's middle is the box's corner, (250, 220); drag it to (290, 260).
  await userEvent.dragAndDrop(
    page.elementLocator(handle),
    page.getByTestId("crop-stage"),
    { targetPosition: { x: 290, y: 260 } },
  );

  expect(await shownCrop()).toEqual({ x: 50, y: 20, size: 240 });
});

test("arrow keys move the box, further with Shift", async () => {
  await renderEditor();
  await box().click();

  // A step is 1% of the short side (3px), 10% with Shift (30px).
  await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}");
  expect(await shownCrop()).toEqual({ x: 106, y: 53, size: 200 });

  await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
  expect(await shownCrop()).toEqual({ x: 76, y: 53, size: 200 });
});

test("+ and - resize the box about its centre, by the same step", async () => {
  await renderEditor({ x: 50, y: 50, size: 200 });
  await box().click();

  // A step is 4% of the side, at least 8px: 8px here. `+` is typed with
  // Shift on most keyboards, and Shift doesn't make it bigger.
  await userEvent.keyboard("{Shift>}{+}{/Shift}");
  expect(await shownCrop()).toEqual({ x: 46, y: 46, size: 208 });
  await userEvent.keyboard("=");
  expect(await shownCrop()).toEqual({ x: 42, y: 42, size: 216 });

  // 4% of 216 is 9 (rounded).
  await userEvent.keyboard("-");
  expect(await shownCrop()).toEqual({ x: 47, y: 47, size: 207 });
  await userEvent.keyboard("--");
  // 207 - 8 = 199, so 200, the minimum, about the centre (150.5, 150.5).
  expect(await shownCrop()).toEqual({ x: 51, y: 51, size: 200 });
});

test("with autoFocus the keys work without clicking the box first", async () => {
  await renderEditor({ x: 100, y: 50, size: 200 }, true);

  await expect.element(box()).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  expect(await shownCrop()).toEqual({ x: 103, y: 50, size: 200 });
});

test("the zoom slider resizes the box about its centre; right zooms in", async () => {
  await renderEditor({ x: 0, y: 0, size: 300 });
  const slider = page.getByRole("slider", { name: "Zoom" });
  // 0 is the biggest box, 100 the smallest, whatever the photo's size.
  await expect.element(slider).toHaveAttribute("aria-valuemin", "0");
  await expect.element(slider).toHaveAttribute("aria-valuemax", "100");
  await expect.element(slider).toHaveAttribute("aria-valuenow", "0");

  await slider.click();
  await userEvent.keyboard("{End}");
  // The smallest box, about the old centre (150, 150).
  expect(await shownCrop()).toEqual({ x: 50, y: 50, size: 200 });

  await userEvent.keyboard("{ArrowLeft}");
  // A step is a hundredth of the range, 1px here; left makes the box bigger.
  expect((await shownCrop()).size).toBe(201);

  await userEvent.keyboard("{Home}");
  // Both ends are reachable: the whole short side.
  expect((await shownCrop()).size).toBe(300);
});

test("the scroll wheel resizes the box about its centre, as far as it scrolled", async () => {
  await renderEditor({ x: 100, y: 50, size: 240 });
  const stage = page.getByTestId("crop-stage").element();
  const wheel = (deltaX: number, deltaY: number) =>
    stage.dispatchEvent(
      new WheelEvent("wheel", { deltaX, deltaY, bubbles: true, cancelable: true }),
    );

  // Scrolling up zooms in: 50px up is 240 × e^-0.1, 217, about the centre
  // (220, 170).
  wheel(0, -50);
  await expect.poll(shownCrop).toEqual({ x: 112, y: 62, size: 217 });

  // A sideways trackpad swipe changes nothing.
  wheel(80, 0);
  // Five small trackpad events add up to one turn of 50px.
  for (let i = 0; i < 5; i++) wheel(0, 10);
  await expect.poll(async () => (await shownCrop()).size).toBe(240);
});

test("each preview shows the crop in its frame, and follows it", async () => {
  await renderEditor({ x: 100, y: 50, size: 200 });
  const square = page.getByRole("img", { name: "Preview: Square" });
  const listing = page.getByRole("img", { name: "Preview: Listing" });

  // The 72px square: the photo at 72/200 of its size, the crop at its corner.
  await expect.element(square).toHaveStyle({
    backgroundSize: "144px 108px",
    backgroundPosition: "-36px -18px",
  });
  // The 112 × 84 listing card: the square drawn 112 wide, 14 cut off above.
  await expect.element(listing).toHaveStyle({
    backgroundSize: "224px 168px",
    backgroundPosition: "-56px -42px",
  });

  await box().click();
  await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");

  // 30px further right: 30 × 72/200 = 10.8px.
  await expect.element(square).toHaveStyle({ backgroundPosition: "-46.8px -18px" });
});

// A photo whose short side is 240px: the slider's 100 steps cover 40px, so
// one step is under half a pixel, and rounding would leave the crop as it
// was.
test("on a small photo each slider key still moves the box a pixel", async () => {
  URL.revokeObjectURL(photo.src);
  photo = await makePhoto(240, 320);
  await renderEditor({ x: 0, y: 40, size: 240 });
  const slider = page.getByRole("slider", { name: "Zoom" });
  await slider.click();
  await userEvent.keyboard("{Home}");
  expect((await shownCrop()).size).toBe(240);

  await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
  expect((await shownCrop()).size).toBe(237);
  await userEvent.keyboard("{ArrowLeft}");
  expect((await shownCrop()).size).toBe(238);
});

test("a mouse wheel that scrolls by lines resizes like 16 pixels a line", async () => {
  await renderEditor({ x: 100, y: 50, size: 240 });

  // Firefox's notch: 3 lines, so 48px: 240 × e^0.096 is 264.
  page.getByTestId("crop-stage").element().dispatchEvent(
    new WheelEvent("wheel", {
      deltaY: 3,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      bubbles: true,
      cancelable: true,
    }),
  );
  await expect.poll(async () => (await shownCrop()).size).toBe(264);
});

/** Sends a pointer event to the box, at (x, y) on the photo. */
function pointer(
  type: string,
  x: number,
  y: number,
  { pointerId = 1, buttons = 1, pointerType = "mouse" } = {},
) {
  const stage = page.getByTestId("crop-stage").element().getBoundingClientRect();
  box()
    .element()
    .dispatchEvent(
      new PointerEvent(type, {
        pointerId,
        pointerType,
        buttons,
        button: type === "pointerdown" ? 0 : -1,
        clientX: stage.left + x,
        clientY: stage.top + y,
        bubbles: true,
        cancelable: true,
      }),
    );
}

test("a second finger doesn't restart the drag, and the first goes on", async () => {
  await renderEditor({ x: 100, y: 50, size: 200 });

  pointer("pointerdown", 200, 150, { pointerType: "touch" });
  pointer("pointermove", 210, 150, { pointerType: "touch" });
  await expect.poll(shownCrop).toEqual({ x: 110, y: 50, size: 200 });

  // Another finger lands and moves: nothing.
  pointer("pointerdown", 250, 200, { pointerId: 2, pointerType: "touch" });
  pointer("pointermove", 290, 230, { pointerId: 2, pointerType: "touch" });
  // The first finger, 20px from where it started.
  pointer("pointermove", 220, 150, { pointerType: "touch" });
  await expect.poll(shownCrop).toEqual({ x: 120, y: 50, size: 200 });
});

test("a drag ends when the box loses the pointer", async () => {
  await renderEditor({ x: 100, y: 50, size: 200 });
  pointer("pointerdown", 200, 150);
  pointer("pointermove", 210, 150);
  await expect.poll(shownCrop).toEqual({ x: 110, y: 50, size: 200 });

  pointer("lostpointercapture", 210, 150);
  pointer("pointermove", 260, 150);

  // Give a move that would land a chance to render, then check it didn't.
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(await shownCrop()).toEqual({ x: 110, y: 50, size: 200 });
});

test("a mouse move with no button held ends a drag whose button-up was missed", async () => {
  await renderEditor({ x: 100, y: 50, size: 200 });
  pointer("pointerdown", 200, 150);
  pointer("pointermove", 210, 150);
  await expect.poll(shownCrop).toEqual({ x: 110, y: 50, size: 200 });

  // The button was let go outside the window.
  pointer("pointermove", 230, 150, { buttons: 0 });
  pointer("pointermove", 260, 150);

  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(await shownCrop()).toEqual({ x: 110, y: 50, size: 200 });
});
