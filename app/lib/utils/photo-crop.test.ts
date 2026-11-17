import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CROP_OUTPUT_SIZE,
  MIN_CROP_SIZE,
  clampCrop,
  cropOutputSize,
  initialCrop,
  moveCrop,
  nudgeStep,
  previewLayout,
  resizeCrop,
  resizeFromCorner,
  resizeStep,
  sizeFromZoom,
  wheelResize,
  zoomFromSize,
} from "./photo-crop";

test("a new crop covers 90% of the short side, in the middle", () => {
  assert.deepEqual(initialCrop(4000, 3000), { size: 2700, x: 650, y: 150 });
  assert.deepEqual(initialCrop(3000, 4000), { size: 2700, x: 150, y: 650 });
  assert.deepEqual(initialCrop(1000, 1000), { size: 900, x: 50, y: 50 });
});

test("a photo smaller than the minimum crop starts with the most it can", () => {
  // 90% of 96 is under the 200 minimum, and the minimum is the photo itself.
  assert.deepEqual(initialCrop(96, 96), { size: 96, x: 0, y: 0 });
  assert.deepEqual(initialCrop(300, 150), { size: 150, x: 75, y: 0 });
});

test("a crop is kept inside the photo at every edge", () => {
  assert.deepEqual(clampCrop({ x: -50, y: -10, size: 500 }, 1000, 800), {
    x: 0,
    y: 0,
    size: 500,
  });
  assert.deepEqual(clampCrop({ x: 900, y: 700, size: 500 }, 1000, 800), {
    x: 500,
    y: 300,
    size: 500,
  });
});

test("a crop is never bigger than the short side nor smaller than the minimum", () => {
  assert.equal(clampCrop({ x: 0, y: 0, size: 5000 }, 1000, 800).size, 800);
  assert.equal(clampCrop({ x: 0, y: 0, size: 10 }, 1000, 800).size, MIN_CROP_SIZE);
});

test("a crop is in whole pixels", () => {
  assert.deepEqual(clampCrop({ x: 10.4, y: 20.6, size: 300.5 }, 1000, 800), {
    x: 10,
    y: 21,
    size: 301,
  });
});

test("moving stops at the photo's edges", () => {
  const crop = { x: 100, y: 100, size: 400 };
  assert.deepEqual(moveCrop(crop, 50, -20, 1000, 800), { x: 150, y: 80, size: 400 });
  assert.deepEqual(moveCrop(crop, 5000, 5000, 1000, 800), { x: 600, y: 400, size: 400 });
  assert.deepEqual(moveCrop(crop, -5000, -5000, 1000, 800), { x: 0, y: 0, size: 400 });
});

test("resizing keeps the centre", () => {
  const crop = { x: 300, y: 200, size: 400 };
  // Centre (500, 400).
  assert.deepEqual(resizeCrop(crop, 200, 1000, 800), { x: 400, y: 300, size: 200 });
  assert.deepEqual(resizeCrop(crop, 600, 1000, 800), { x: 200, y: 100, size: 600 });
});

test("resizing near an edge moves the centre so the crop stays inside", () => {
  const crop = { x: 0, y: 0, size: 300 };
  assert.deepEqual(resizeCrop(crop, 500, 1000, 800), { x: 0, y: 0, size: 500 });
  // As big as it gets: the short side.
  assert.deepEqual(resizeCrop(crop, 5000, 1000, 800), { x: 0, y: 0, size: 800 });
});

test("the corner handle keeps the top-left corner and stops at the far edges", () => {
  const crop = { x: 300, y: 200, size: 400 };
  assert.deepEqual(resizeFromCorner(crop, 450, 1000, 800), { x: 300, y: 200, size: 450 });
  // Room to the bottom is 600: it stops there rather than moving the corner.
  assert.deepEqual(resizeFromCorner(crop, 900, 1000, 800), { x: 300, y: 200, size: 600 });
  assert.deepEqual(resizeFromCorner(crop, 20, 1000, 800), {
    x: 300,
    y: 200,
    size: MIN_CROP_SIZE,
  });
});

test("an arrow key moves 1% of the short side, 10% with Shift", () => {
  assert.equal(nudgeStep(4000, 3000, false), 30);
  assert.equal(nudgeStep(4000, 3000, true), 300);
  assert.equal(nudgeStep(50, 50, false), 1);
});

test("a resize step is 4% of the crop, at least 8 pixels", () => {
  assert.equal(resizeStep(1000), 40);
  assert.equal(resizeStep(100), 8);
});

test("the wheel resizes in proportion to how far it scrolled", () => {
  assert.equal(wheelResize(1000, 0), 1000);
  assert.ok(Math.abs(wheelResize(1000, 100) - 1221.4) < 0.1);
  assert.ok(Math.abs(wheelResize(1000, -100) - 818.7) < 0.1);
  // Ten small trackpad events add up to one big wheel turn.
  let size = 1000;
  for (let i = 0; i < 10; i++) size = wheelResize(size, 10);
  assert.ok(Math.abs(size - wheelResize(1000, 100)) < 1e-6);
});

test("the zoom slider runs from the biggest crop (0) to the smallest (100)", () => {
  assert.equal(zoomFromSize(3010, 200, 3010), 0);
  assert.equal(zoomFromSize(200, 200, 3010), 100);
  assert.equal(sizeFromZoom(0, 200, 3010), 3010);
  assert.equal(sizeFromZoom(100, 200, 3010), 200);
  assert.equal(sizeFromZoom(50, 200, 3010), 1605);
  // A photo no bigger than the minimum has nothing to zoom.
  assert.equal(zoomFromSize(96, 96, 96), 0);
});

test("a saved photo is 1200 pixels, or the crop's own size when smaller", () => {
  assert.equal(cropOutputSize({ x: 0, y: 0, size: 2700 }), CROP_OUTPUT_SIZE);
  assert.equal(cropOutputSize({ x: 0, y: 0, size: 900 }), 900);
});

test("a square preview shows exactly the crop", () => {
  // A 1000 × 800 photo, cropped at (200, 100) by 400, in a 100px square:
  // the photo drawn at a quarter of its size, the crop's corner at (0, 0).
  assert.deepEqual(previewLayout({ x: 200, y: 100, size: 400 }, 1000, 800, 100, 100), {
    width: 250,
    height: 200,
    left: -50,
    top: -25,
  });
});

test("a wide preview fills its width and cuts the top and bottom of the crop", () => {
  // A 200 × 100 frame: the square is drawn 200 wide, so 50 is cut off above
  // and below.
  assert.deepEqual(previewLayout({ x: 0, y: 0, size: 400 }, 1000, 800, 200, 100), {
    width: 500,
    height: 400,
    left: 0,
    top: -50,
  });
});
