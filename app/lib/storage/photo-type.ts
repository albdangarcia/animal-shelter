// What an animal photo may be. Every page shows a photo through `next/image`
// in any browser, so the shelter keeps only what every browser can show:
// JPEG, PNG and WebP. The type is read from the file's first bytes, never
// from its name or what the browser claims, as for medical documents.
//
// Server only in practice (the photo service reads it); the uploader shows
// the route's message rather than checking for itself.

import {
  DOCUMENT_SNIFF_BYTES,
  sniffDocumentType,
} from "@/app/lib/utils/medical-document-file";
import type { PhotoContentType } from "@/app/lib/storage/animal-photo-store";

export const NOT_A_PHOTO_MESSAGE =
  "This file isn't a photo. Add a JPEG, PNG or WebP image.";

export const HEIC_PHOTO_MESSAGE =
  "HEIC photos can't be shown in most browsers. Save a copy as a JPEG and add that instead. " +
  "To have an iPhone take JPEG photos, set Settings > Camera > Formats to Most Compatible.";

/** The photo's content type, read from its first bytes, or why it isn't a
 * photo the shelter keeps. */
export function checkPhotoType(
  bytes: Uint8Array,
): { contentType: PhotoContentType } | { error: string } {
  const sniffed = sniffDocumentType(bytes.subarray(0, DOCUMENT_SNIFF_BYTES));
  switch (sniffed) {
    case "image/jpeg":
    case "image/png":
    case "image/webp":
      return { contentType: sniffed };
    case "heic":
      return { error: HEIC_PHOTO_MESSAGE };
    default:
      return { error: NOT_A_PHOTO_MESSAGE };
  }
}
