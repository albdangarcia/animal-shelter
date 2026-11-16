import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PHOTO_BYTES,
  asJpegName,
  PHOTO_TOO_LARGE_MESSAGE,
  fitWithin,
  isPhotoTooLarge,
  readUploadedPhoto,
} from "./photo-size";

test("the limit leaves room under Vercel's 4.5 MB request body limit", () => {
  // The rest of the multipart body (boundaries, headers, the animal id) is a
  // few hundred bytes.
  assert.ok(MAX_PHOTO_BYTES + 16 * 1024 < 4.5 * 1000 * 1000);
});

test("a photo is too large only above the limit", () => {
  assert.equal(isPhotoTooLarge(MAX_PHOTO_BYTES), false);
  assert.equal(isPhotoTooLarge(MAX_PHOTO_BYTES + 1), true);
  assert.equal(isPhotoTooLarge(0), false);
});

test("a photo is scaled so its longest side fits, keeping its shape", () => {
  assert.deepEqual(fitWithin(4032, 3024, 2560), { width: 2560, height: 1920 });
  assert.deepEqual(fitWithin(3024, 4032, 2560), { width: 1920, height: 2560 });
  assert.deepEqual(fitWithin(5000, 5000, 2560), { width: 2560, height: 2560 });
});

test("a photo that already fits is never made bigger", () => {
  assert.deepEqual(fitWithin(1200, 800, 2560), { width: 1200, height: 800 });
  assert.deepEqual(fitWithin(2560, 100, 2560), { width: 2560, height: 100 });
});

test("a very thin photo keeps at least one pixel on each side", () => {
  assert.deepEqual(fitWithin(100000, 1, 2560), { width: 2560, height: 1 });
});

test("a photo saved again as a JPEG gets a .jpg name", () => {
  assert.equal(asJpegName("rex.heic"), "rex.jpg");
  assert.equal(asJpegName("IMG_0042.PNG"), "IMG_0042.jpg");
  assert.equal(asJpegName("charlie.jpeg"), "charlie.jpg");
  assert.equal(asJpegName("max.and.ruby.png"), "max.and.ruby.jpg");
  assert.equal(asJpegName("no-extension"), "no-extension.jpg");
  assert.equal(asJpegName(".png"), "photo.jpg");
});

// The route's own check, for a photo not sent through the uploader. It runs
// before anything is put in the Blob store.
test("the route takes a photo up to the limit", () => {
  const photo = new File([new Uint8Array(MAX_PHOTO_BYTES)], "rex.jpg", {
    type: "image/jpeg",
  });
  assert.deepEqual(readUploadedPhoto(photo), { photo });
});

test("the route refuses a photo over the limit with a 413", () => {
  const photo = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "rex.jpg", {
    type: "image/jpeg",
  });
  assert.deepEqual(readUploadedPhoto(photo), {
    status: 413,
    error: PHOTO_TOO_LARGE_MESSAGE,
  });
});

test("the route refuses a missing file, or text sent as the file", () => {
  const refusal = { status: 400, error: "No file found." };
  assert.deepEqual(readUploadedPhoto(null), refusal);
  assert.deepEqual(readUploadedPhoto("a".repeat(MAX_PHOTO_BYTES + 1)), refusal);
});
