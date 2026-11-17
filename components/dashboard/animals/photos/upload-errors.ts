// What the photo uploader tells staff when an upload fails.
//
// Uppy's fetcher turns every non-2xx answer from /api/upload-to-blob into a
// NetworkError, whose message is always "This looks like a network error…",
// even for a 403 or a 500. The uploader hands these two functions to
// XHRUpload so a failed answer carries a message that says what happened.

import { PHOTO_TOO_LARGE_MESSAGE } from "@/app/lib/storage/photo-size";

export const UPLOAD_FAILED_MESSAGE = "Failed to upload image. Please try again.";
export const UPLOAD_UNREACHABLE_MESSAGE =
  "Couldn't reach the server, so the image wasn't uploaded. Check your connection and try again.";

/**
 * Never retry on its own. A refusal (not signed in, no permission, no file)
 * gets the same answer every time, and a retry after a dropped connection or
 * a gateway timeout (502, 504) can come after the server already saved the
 * photo, adding it twice. A failed upload stays in the uploader, whose
 * status bar shows "Upload failed" and a Retry button.
 */
export const shouldRetryUpload = (): boolean => false;

/** The `error` text the route sends with a refusal, if there is one. */
function refusalMessage(xhr: XMLHttpRequest): string | null {
  try {
    const body: unknown = JSON.parse(xhr.responseText);
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
 * XHRUpload's `onAfterResponse`: fails a non-2xx answer with a message of its
 * own. A refusal (4xx) says why in the route's words; a server failure (5xx)
 * gets the general message, since the route's own ("Upload failed.") says no
 * more than that. A 413 says the photo is too big: on Vercel it comes from
 * the platform, not the route (FUNCTION_PAYLOAD_TOO_LARGE), with no `error`
 * to read, and trying again can never work.
 */
export function failUnsuccessfulUpload(xhr: XMLHttpRequest): void {
  if (xhr.status >= 200 && xhr.status < 300) return;
  let message = UPLOAD_FAILED_MESSAGE;
  if (xhr.status === 413) message = PHOTO_TOO_LARGE_MESSAGE;
  else if (xhr.status >= 400 && xhr.status < 500) {
    message = refusalMessage(xhr) ?? UPLOAD_FAILED_MESSAGE;
  }
  throw new Error(message);
}

/** The toast for an `upload-error` event. */
export function uploadErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    // No answer at all (offline, connection dropped). Read from the request,
    // not from Uppy's NetworkError: Uppy builds one for a refused answer too,
    // when nothing turns it into an error first.
    if (
      "request" in error &&
      typeof error.request === "object" &&
      error.request !== null &&
      "status" in error.request &&
      error.request.status === 0
    ) {
      return UPLOAD_UNREACHABLE_MESSAGE;
    }
    if (
      "message" in error &&
      typeof error.message === "string" &&
      error.message.trim()
    ) {
      return error.message;
    }
  }
  return UPLOAD_FAILED_MESSAGE;
}
