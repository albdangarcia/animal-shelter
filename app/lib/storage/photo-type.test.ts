import { test } from "node:test";
import assert from "node:assert/strict";
import { HEIC_PHOTO_MESSAGE, NOT_A_PHOTO_MESSAGE, checkPhotoType } from "./photo-type";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((char) => char.charCodeAt(0)) : part,
    ),
  );

test("a JPEG, a PNG and a WebP are photos, by their first bytes", () => {
  assert.deepEqual(checkPhotoType(bytes([0xff, 0xd8, 0xff, 0xe0], "rest")), {
    contentType: "image/jpeg",
  });
  assert.deepEqual(
    checkPhotoType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "rest")),
    { contentType: "image/png" },
  );
  assert.deepEqual(checkPhotoType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")), {
    contentType: "image/webp",
  });
});

test("a PDF, a text file and an empty file aren't photos", () => {
  assert.deepEqual(checkPhotoType(bytes("%PDF-1.4 a document")), { error: NOT_A_PHOTO_MESSAGE });
  // What a text file renamed rex.jpg holds: its name never counts.
  assert.deepEqual(checkPhotoType(bytes("Rex, brown, friendly")), { error: NOT_A_PHOTO_MESSAGE });
  assert.deepEqual(checkPhotoType(new Uint8Array()), { error: NOT_A_PHOTO_MESSAGE });
});

test("an iPhone's HEIC photo is refused with advice of its own", () => {
  assert.deepEqual(checkPhotoType(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0])), {
    error: HEIC_PHOTO_MESSAGE,
  });
});
