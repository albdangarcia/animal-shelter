// What the photo uploader tells staff when adding a photo fails.

import { PHOTO_TOO_LARGE_MESSAGE } from "@/app/lib/storage/photo-size";

export const UPLOAD_FAILED_MESSAGE = "Failed to upload image. Please try again.";
export const UPLOAD_UNREACHABLE_MESSAGE =
  "Couldn't reach the server, so the image wasn't uploaded. Check your connection and try again.";
/**
 * A file the browser can't draw, so it can't be cropped: a HEIC photo
 * outside Safari, a PDF, anything that isn't an image. Shown with the file's
 * name.
 */
export const UNREADABLE_PHOTO_MESSAGE =
  "This file can't be opened as a photo in this browser, so it wasn't added. " +
  "Add a JPEG, PNG or WebP photo. To have an iPhone take JPEG photos, set " +
  "Settings > Camera > Formats to Most Compatible.";
/** The crop couldn't be turned into a file: out of memory, say. */
export const CROP_FAILED_MESSAGE =
  "The cropped photo couldn't be made, so it wasn't uploaded. Try again, or close other tabs first.";

/** The `error` text the route sends with a refusal, if there is one. */
async function refusalMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error.trim()
    ) {
      return body.error;
    }
  } catch {
    // Not JSON: a proxy's error page, say.
  }
  return null;
}

/**
 * The message for an upload that didn't succeed: `null` when no answer came
 * at all (offline, connection dropped). A refusal (4xx) says why in the
 * route's words; a server failure (5xx) gets the general message, since the
 * route's own ("Upload failed.") says no more than that. A 413 says the
 * photo is too big: on Vercel it comes from the platform, not the route
 * (FUNCTION_PAYLOAD_TOO_LARGE), with no `error` to read.
 *
 * The uploader never sends a photo again on its own: a refusal gets the same
 * answer every time, and a retry after a dropped connection or a gateway
 * timeout can come after the server already saved the photo, adding it
 * twice. Staff press Save again.
 */
export async function uploadFailureMessage(
  response: Response | null,
): Promise<string> {
  if (!response) return UPLOAD_UNREACHABLE_MESSAGE;
  if (response.status === 413) return PHOTO_TOO_LARGE_MESSAGE;
  if (response.status >= 400 && response.status < 500) {
    return (await refusalMessage(response)) ?? UPLOAD_FAILED_MESSAGE;
  }
  return UPLOAD_FAILED_MESSAGE;
}
