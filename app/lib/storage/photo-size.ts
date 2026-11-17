// How big an animal photo may be when it reaches POST /api/animal-photos.
//
// The route runs as a Vercel Function, which refuses any request body over
// 4.5 MB with a 413 (FUNCTION_PAYLOAD_TOO_LARGE) before the route sees it.
// The Photos tab only ever sends a cropped square of at most 1200 pixels
// (components/dashboard/animals/photos/crop-photo.ts), a few hundred KB, so
// only a photo sent another way meets this limit. 4 MiB leaves room under
// 4.5 MB for the rest of the multipart body.
//
// No imports: the uploader (a client component), the route and a unit test
// all read this file.

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** MAX_PHOTO_BYTES as staff read it. */
export const MAX_PHOTO_SIZE_LABEL = "4 MB";

export const PHOTO_TOO_LARGE_MESSAGE =
  `This photo is too big to upload. Photos can be up to ${MAX_PHOTO_SIZE_LABEL}. ` +
  "Save a smaller copy as a JPEG and add that instead.";

export function isPhotoTooLarge(bytes: number): boolean {
  return bytes > MAX_PHOTO_BYTES;
}

/**
 * The photo in POST /api/animal-photos's form `file` field, or why the route
 * refuses it. A text field named `file` is no photo. One over
 * MAX_PHOTO_BYTES is refused as Vercel would refuse it above 4.5 MB, so local
 * dev refuses the same photos as production; the uploader only sends a crop,
 * far smaller, so only a photo sent another way gets the 413.
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
