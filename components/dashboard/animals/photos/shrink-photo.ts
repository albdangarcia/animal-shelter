// Makes a photo small enough for /api/upload-to-blob, in the browser.
//
// A Vercel Function refuses a request body over 4.5 MB, and phone photos are
// often bigger, so the uploader sends a smaller copy instead: at most
// SHRUNK_PHOTO_LONGEST_SIDE pixels on its longest side, saved as a JPEG. The
// size limit and the numbers are in app/lib/storage/photo-size.ts.

import type { Body, Meta, Uppy, UppyFile } from "@uppy/core";
import {
  MAX_PHOTO_BYTES,
  SHRUNK_PHOTO_QUALITIES,
  asJpegName,
  fitWithin,
  isPhotoTooLarge,
} from "@/app/lib/storage/photo-size";

function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

/**
 * A JPEG copy of `photo` no bigger than MAX_PHOTO_BYTES, or null when the
 * browser can't read it (not an image, or a format it can't open, such as a
 * HEIC photo outside Safari) or no copy fits.
 */
export async function shrinkPhoto(photo: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    // Turned upright from the photo's EXIF orientation, as browsers show it
    // by default. Not asked for by name: an engine that doesn't know the
    // option would throw, and the photo would be refused.
    bitmap = await createImageBitmap(photo);
  } catch {
    return null;
  }

  const canvas = document.createElement("canvas");
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // JPEG has no transparency: a transparent PNG's background turns white,
    // not black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of SHRUNK_PHOTO_QUALITIES) {
      const jpeg = await canvasToJpeg(canvas, quality);
      if (jpeg && jpeg.size <= MAX_PHOTO_BYTES) return jpeg;
    }
    return null;
  } finally {
    bitmap.close();
    // Hand the canvas's memory back now, not when it is collected: Safari
    // caps the canvas memory a page may hold.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * An Uppy preprocessor: before an upload starts, swaps each photo over
 * MAX_PHOTO_BYTES for a smaller copy. Photos that already fit are sent as
 * they are.
 *
 * A photo that can't be made small enough is handed to `onRefused` and taken
 * out of the uploader. Retry could never send it, and Uppy retries every
 * failed file whenever another one is added, so leaving it in would refuse it
 * again, with another message, each time.
 *
 * Photos are shrunk one at a time: each decoded phone photo takes 50 to
 * 100 MB, and a dozen at once can run Safari out of canvas memory.
 */
export async function shrinkLargePhotos<M extends Meta, B extends Body>(
  uppy: Uppy<M, B>,
  fileIDs: string[],
  onRefused: (file: UppyFile<M, B>) => void,
): Promise<void> {
  for (const fileID of fileIDs) {
    // Staff can remove a photo, or cancel them all, while one is shrinking.
    const file = uppy.getFile(fileID);
    if (!file || file.isRemote || !file.data) continue;
    if (!isPhotoTooLarge(file.data.size)) continue;

    uppy.emit("preprocess-progress", file, {
      mode: "indeterminate",
      message: "Making the photo smaller…",
    });
    let smaller: Blob | null = null;
    try {
      smaller = await shrinkPhoto(file.data);
    } catch {
      // Refused below, as a photo that can't be made smaller: one photo
      // failing mustn't stop the others in the batch.
    }

    const current = uppy.getFile(fileID);
    if (!current) continue;
    uppy.emit("preprocess-complete", current);

    if (!smaller) {
      onRefused(current);
      uppy.removeFile(fileID);
      continue;
    }
    const name = asJpegName(current.name);
    uppy.setFileState(fileID, {
      data: smaller,
      size: smaller.size,
      name,
      type: smaller.type,
      meta: { ...current.meta, name, type: smaller.type },
      progress: { ...current.progress, bytesTotal: smaller.size },
    });
  }
}
