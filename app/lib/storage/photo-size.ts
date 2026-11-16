// How big an animal photo may be when it reaches /api/upload-to-blob.
//
// The route runs as a Vercel Function, which refuses any request body over
// 4.5 MB with a 413 (FUNCTION_PAYLOAD_TOO_LARGE) before the route sees it,
// and many phone photos are bigger than that. So the Photos tab's uploader
// makes a photo over MAX_PHOTO_BYTES smaller in the browser before sending
// it (components/dashboard/animals/photos/shrink-photo.ts), and refuses one
// it can't make small enough. 4 MiB leaves room under 4.5 MB for the rest of
// the multipart body.
//
// No imports: the uploader (a client component), the route and a unit test
// all read this file.

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** MAX_PHOTO_BYTES as staff read it. */
export const MAX_PHOTO_SIZE_LABEL = "4 MB";

/**
 * The longest side, in pixels, of a photo the uploader made smaller. Big
 * enough for a full-screen view of the photo; a 2560 × 1920 JPEG is about
 * 1 to 2 MB.
 */
export const SHRUNK_PHOTO_LONGEST_SIDE = 2560;

/** The JPEG qualities the uploader tries, best first, until one fits. */
export const SHRUNK_PHOTO_QUALITIES = [0.85, 0.7, 0.55] as const;

export const PHOTO_TOO_LARGE_MESSAGE =
  `This photo is too big to upload. Photos can be up to ${MAX_PHOTO_SIZE_LABEL}, ` +
  "and this one couldn't be made smaller. Save a smaller copy as a JPEG and add that instead.";

export function isPhotoTooLarge(bytes: number): boolean {
  return bytes > MAX_PHOTO_BYTES;
}

/**
 * The size to draw a `width` × `height` image at so that its longest side is
 * at most `longestSide`, keeping its shape. An image that already fits keeps
 * its size; it is never made bigger.
 */
export function fitWithin(
  width: number,
  height: number,
  longestSide: number = SHRUNK_PHOTO_LONGEST_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, longestSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The file name for a photo saved again as a JPEG: "rex.heic" → "rex.jpg". */
export function asJpegName(name: string): string {
  const stem = name.replace(/\.[^./\\]*$/, "");
  return `${stem || "photo"}.jpg`;
}

/**
 * The photo in /api/upload-to-blob's form `file` field, or why the route
 * refuses it. A text field named `file` is no photo. One over
 * MAX_PHOTO_BYTES is refused as Vercel would refuse it above 4.5 MB, so local
 * dev refuses the same photos as production; the uploader makes a bigger
 * photo smaller before sending it, so only a photo sent another way gets the
 * 413.
 */
export function readUploadedPhoto(
  entry: FormDataEntryValue | null,
): { photo: File } | { status: 400 | 413; error: string } {
  if (!(entry instanceof File)) {
    return { status: 400, error: "No file found." };
  }
  if (isPhotoTooLarge(entry.size)) {
    return { status: 413, error: PHOTO_TOO_LARGE_MESSAGE };
  }
  return { photo: entry };
}
