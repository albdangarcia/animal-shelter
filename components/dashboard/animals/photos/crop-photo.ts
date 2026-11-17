// Opens a photo in the browser and saves a crop of it, on a canvas.
//
// Only the cropped square is uploaded, never the original: a WebP of at most
// CROP_OUTPUT_SIZE pixels, about 50 to 300 KB, far under the 4 MB the route
// takes (app/lib/storage/photo-size.ts). A browser that can't write WebP
// (Safari, which hands back a PNG for a type it doesn't know) saves a JPEG.
//
// A photo is opened as an <img>, the same way the editor shows it, so its
// size, the box drawn over it and the pixels saved all agree, whatever the
// photo's EXIF orientation (a phone's portrait photo is stored on its side).

import { cropOutputSize, type Crop } from "@/app/lib/utils/photo-crop";

export const CROP_WEBP_QUALITY = 0.8;
export const CROP_JPEG_QUALITY = 0.85;
/** The side of a photo's thumbnail in the batch list, in pixels. */
export const THUMBNAIL_SIZE = 72;

/** A photo opened in the browser, upright, and how to let it go. */
export interface OpenedPhoto {
  image: HTMLImageElement;
  width: number;
  height: number;
  /** Lets the browser drop the decoded photo and its object URL. */
  release: () => void;
}

/**
 * The photo, decoded and turned upright from its EXIF orientation (as
 * browsers show it), or null when the browser can't open it: not an image,
 * or a format it can't read, such as a HEIC photo outside Safari, or one too
 * big for its memory. The caller releases it.
 */
export async function openPhoto(file: Blob): Promise<OpenedPhoto | null> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  const release = () => {
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
  };
  image.src = url;
  try {
    await image.decode();
  } catch {
    release();
    return null;
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    release();
    return null;
  }
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Hands a canvas's memory back now: Safari caps what a page may hold. */
function freeCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Whether this browser writes WebP. Asked of a 1-pixel canvas, so a browser
 * that can't (Safari) doesn't first write a whole 1200px PNG for nothing.
 */
async function canWriteWebp(): Promise<boolean> {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  try {
    const blob = await canvasToBlob(canvas, "image/webp", CROP_WEBP_QUALITY);
    return blob?.type === "image/webp";
  } finally {
    freeCanvas(canvas);
  }
}

/**
 * The square `crop` of `photo`, as the file to upload: a WebP, or a JPEG
 * where the browser can't write WebP. `crop` is in the photo's own pixels.
 * Throws when the browser can't make the file (out of canvas memory, say).
 */
export async function exportCrop(
  photo: CanvasImageSource,
  crop: Crop,
): Promise<Blob> {
  const webp = await canWriteWebp();
  const edge = cropOutputSize(crop);
  const canvas = document.createElement("canvas");
  try {
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas");
    // A transparent PNG gets a white background, in either format: JPEG has
    // no transparency and would turn it black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, edge, edge);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      photo,
      crop.x,
      crop.y,
      crop.size,
      crop.size,
      0,
      0,
      edge,
      edge,
    );

    const blob = webp
      ? await canvasToBlob(canvas, "image/webp", CROP_WEBP_QUALITY)
      : await canvasToBlob(canvas, "image/jpeg", CROP_JPEG_QUALITY);
    if (!blob) throw new Error("The browser couldn't save the photo");
    return blob;
  } finally {
    freeCanvas(canvas);
  }
}

/**
 * A small square thumbnail of `photo` for the batch list, so the list
 * doesn't hold every photo decoded at full size. Null if it can't be made;
 * the list then shows no picture.
 */
export async function makeThumbnail(
  photo: OpenedPhoto,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  try {
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = THUMBNAIL_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // On white, as the saved photo is: a JPEG would turn a transparent
    // PNG's background black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    context.imageSmoothingQuality = "high";
    const side = Math.min(photo.width, photo.height);
    context.drawImage(
      photo.image,
      (photo.width - side) / 2,
      (photo.height - side) / 2,
      side,
      side,
      0,
      0,
      THUMBNAIL_SIZE,
      THUMBNAIL_SIZE,
    );
    return await canvasToBlob(canvas, "image/jpeg", 0.8);
  } catch {
    return null;
  } finally {
    freeCanvas(canvas);
  }
}

/** The file name for an exported crop: "IMG_0042.HEIC" → "IMG_0042.webp". */
export function croppedFileName(name: string, type: string): string {
  const stem = name.replace(/\.[^./\\]*$/, "") || "photo";
  return `${stem}.${type === "image/webp" ? "webp" : "jpg"}`;
}
