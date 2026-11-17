import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PHOTO_BYTES,
  PHOTO_TOO_LARGE_MESSAGE,
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
