// Saving a crop: the photo opened again, the square exported, and posted to
// a photo route with the form fields it needs. Shared by the uploader
// (POST /api/animal-photos) and the replace dialog
// (POST /api/animal-photos/replace), so the two save the same way.
//
// Never sends twice on its own: see `uploadFailureMessage`.

import type { Crop } from "@/app/lib/utils/photo-crop";
import { croppedFileName, exportCrop, openPhoto } from "./crop-photo";
import { CROP_FAILED_MESSAGE, uploadFailureMessage } from "./upload-errors";

/**
 * The form field for a photo's framing in the wide frames: none when centred,
 * so a photo staff didn't frame is sent as before.
 */
export function focusField(focusY: number | null): Record<string, string> {
  return focusY === null ? {} : { focusY: String(focusY) };
}

export type SaveCropResult = { ok: true } | { ok: false; message: string };

/**
 * Crops `file` to `crop`, and posts the square as the form's `file`, beside
 * `fields`, to `endpoint`. Answers why not, in staff's words, when the crop
 * couldn't be made, no answer came, or the route refused it.
 */
export async function saveCrop(
  file: File,
  crop: Crop,
  endpoint: string,
  fields: Record<string, string>,
): Promise<SaveCropResult> {
  let cropped: Blob;
  try {
    const opened = await openPhoto(file);
    if (!opened) throw new Error("The photo can't be opened again");
    try {
      cropped = await exportCrop(opened.image, crop);
    } finally {
      opened.release();
    }
  } catch {
    return { ok: false, message: CROP_FAILED_MESSAGE };
  }

  const form = new FormData();
  form.append(
    "file",
    new File([cropped], croppedFileName(file.name, cropped.type), {
      type: cropped.type,
    }),
  );
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  let response: Response | null = null;
  try {
    response = await fetch(endpoint, { method: "POST", body: form });
  } catch {
    // No answer: offline, or the connection dropped.
  }
  if (!response?.ok) {
    return { ok: false, message: await uploadFailureMessage(response) };
  }
  return { ok: true };
}
