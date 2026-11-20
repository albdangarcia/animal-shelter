import type prisma from "@/app/lib/prisma";
import { AnimalActivityType } from "@/prisma/generated/enums";
import type { AnimalPhotoStore, PhotoContentType } from "@/app/lib/storage/animal-photo-store";
import { newPhotoName } from "@/app/lib/storage/animal-photo-store";
import { PHOTO_TOO_LARGE_MESSAGE, isPhotoTooLarge } from "@/app/lib/storage/photo-size";
import { checkPhotoType } from "@/app/lib/storage/photo-type";

/**
 * An animal's photos: adding one, replacing one, framing one and deleting
 * one, with their files in a photo store (`app/lib/storage/animal-photo-store.ts`).
 *
 * Like the other services, this module has **no `next/*` and no auth
 * imports**, so the database tests can drive it; whoever calls it (the upload
 * and replace routes, the delete action) has checked who may. A refusal comes
 * back as a result with a message staff can read and the status the route
 * answers with; anything else that goes wrong is thrown.
 *
 * A store can't take part in a transaction, so the order of file and row is
 * chosen so that a failure never leaves a row without its file: adding and
 * replacing put the new file first and remove it again only once they are
 * sure no row holds it; deleting and replacing remove the old file only after
 * the row stops holding it, so a failed removal leaves only a stray file.
 */

type Db = typeof prisma;

export type PhotoRefusal = { ok: false; status: 400 | 404 | 409 | 413; message: string };

export const ANIMAL_NOT_FOUND_MESSAGE =
  "This animal wasn't found, so the photo wasn't added. Reload the page and try again.";

export const PHOTO_NOT_FOUND_MESSAGE =
  "This photo wasn't found. It may have been deleted in another tab. Reload the page.";

export const PHOTO_CHANGED_MESSAGE =
  "This photo has changed since you opened the page. It may have been replaced in another tab. Reload the page and try again.";

/** The photo's content type, or why the bytes can't be a photo: over the size
 * limit, or not a JPEG, PNG or WebP (read from their first bytes). */
function checkPhotoBytes(bytes: Uint8Array): { contentType: PhotoContentType } | PhotoRefusal {
  if (isPhotoTooLarge(bytes.byteLength)) {
    return { ok: false, status: 413, message: PHOTO_TOO_LARGE_MESSAGE };
  }
  const type = checkPhotoType(bytes);
  if ("error" in type) {
    return { ok: false, status: 400, message: type.error };
  }
  return { contentType: type.contentType };
}

/**
 * A framing from 0 to 1, or null. The routes and actions parse what staff
 * send (`parseFocusY`), so anything else is a caller's mistake; the column's
 * check refuses it too, but only where migrations ran (test databases are
 * pushed).
 */
function assertFocusY(focusY: number | null): void {
  if (focusY !== null && !(focusY >= 0 && focusY <= 1)) {
    throw new RangeError(`A photo's focusY must be from 0 to 1, or null; got ${focusY}`);
  }
}

/**
 * Adds a photo at the end of the animal's photos and logs `PHOTO_UPLOADED`.
 * Refuses a file over the size limit, one that isn't a JPEG, PNG or WebP (read
 * from its first bytes) and an unknown animal, before anything is stored.
 * `focusY` is where the photo sits in a wide frame (`AnimalImage.focusY`);
 * left out, it is centred.
 */
export async function addAnimalPhoto(
  db: Db,
  store: AnimalPhotoStore,
  input: { animalId: string; staffMemberId: string; bytes: Uint8Array; focusY?: number | null },
): Promise<{ ok: true; imageId: string; url: string } | PhotoRefusal> {
  const { animalId, staffMemberId, bytes, focusY = null } = input;
  assertFocusY(focusY);
  const type = checkPhotoBytes(bytes);
  if ("ok" in type) {
    return type;
  }
  const animal = await db.animal.findUnique({ where: { id: animalId }, select: { id: true } });
  if (!animal) {
    return { ok: false, status: 404, message: ANIMAL_NOT_FOUND_MESSAGE };
  }

  const url = await store.put(newPhotoName(type.contentType), bytes, type.contentType);
  try {
    const imageId = await db.$transaction(async (tx) => {
      // New photo lands at the end of this animal's gallery. Not unique, so a
      // concurrent upload can pick the same value — reads break the tie on
      // createdAt (see app/lib/utils/animal-image-order.ts).
      const { _max } = await tx.animalImage.aggregate({
        where: { animalId },
        _max: { sortOrder: true },
      });
      const { id } = await tx.animalImage.create({
        data: { url, animalId, sortOrder: (_max.sortOrder ?? -1) + 1, focusY },
        select: { id: true },
      });
      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.PHOTO_UPLOADED,
          changedById: staffMemberId,
          changeSummary: `A new photo was uploaded. URL: ${url}`,
        },
      });
      return id;
    });
    return { ok: true, imageId, url };
  } catch (error) {
    // The commit may have landed with only its answer lost (a dropped
    // connection), so look before removing the file: a row that holds it
    // means the photo was added. If even that look fails, keep the file; a
    // stray file is the safe side, a row without its file is not.
    let row: { id: string } | null;
    try {
      row = await db.animalImage.findFirst({ where: { animalId, url }, select: { id: true } });
    } catch (lookError) {
      console.error(`Couldn't tell whether a photo's row was written, so its file is kept (${url}):`, lookError);
      throw error;
    }
    if (row) {
      return { ok: true, imageId: row.id, url };
    }
    try {
      await store.remove(url);
    } catch (removeError) {
      console.error(`Failed to remove a photo's file after its row wasn't written (${url}):`, removeError);
    }
    throw error;
  }
}

/**
 * Why the photo can't be replaced as it is now, or null when it is still this
 * animal's and still holds `expectedUrl`.
 */
async function staleRefusal(
  db: Pick<Db, "animalImage">,
  input: { animalId: string; imageId: string; expectedUrl: string },
): Promise<PhotoRefusal | null> {
  const image = await db.animalImage.findFirst({
    where: { id: input.imageId, animalId: input.animalId },
    select: { url: true },
  });
  if (!image) {
    return { ok: false, status: 404, message: PHOTO_NOT_FOUND_MESSAGE };
  }
  if (image.url !== input.expectedUrl) {
    return { ok: false, status: 409, message: PHOTO_CHANGED_MESSAGE };
  }
  return null;
}

/**
 * Why a change scoped to the photo's `expectedUrl` changed nothing: it is gone
 * (404), or holds another file now (409).
 */
async function missedRefusal(
  db: Pick<Db, "animalImage">,
  input: { animalId: string; imageId: string; expectedUrl: string },
): Promise<PhotoRefusal> {
  return (await staleRefusal(db, input)) ?? { ok: false, status: 409, message: PHOTO_CHANGED_MESSAGE };
}

/**
 * Swaps one of the animal's photos for a new one in the same place: the same
 * row, so its id and its place in the order stay and a primary photo stays
 * primary. Logs `PHOTO_REPLACED`, then removes the old file (the store leaves
 * a seed photo's alone).
 *
 * `expectedUrl` is the URL the caller showed staff. The row is changed only
 * while it still holds it, so a photo replaced in another tab meanwhile is
 * refused (409) rather than overwritten, and one deleted meanwhile is refused
 * as delete refuses it (404). It is only compared: the file removed is the
 * one the row held. Refuses bytes that can't be a photo, as adding does; every
 * refusal found before the upload stores nothing.
 *
 * The new photo takes `focusY` (left out, centred): the old one's framing was
 * chosen for another picture.
 */
export async function replaceAnimalPhoto(
  db: Db,
  store: AnimalPhotoStore,
  input: {
    animalId: string;
    imageId: string;
    expectedUrl: string;
    staffMemberId: string;
    bytes: Uint8Array;
    focusY?: number | null;
  },
): Promise<{ ok: true; imageId: string; url: string; replacedUrl: string } | PhotoRefusal> {
  const { animalId, imageId, expectedUrl, staffMemberId, bytes, focusY = null } = input;
  assertFocusY(focusY);
  const type = checkPhotoBytes(bytes);
  if ("ok" in type) {
    return type;
  }
  const before = await staleRefusal(db, input);
  if (before) {
    return before;
  }

  const url = await store.put(newPhotoName(type.contentType), bytes, type.contentType);
  const removeNewFile = async () => {
    try {
      await store.remove(url);
    } catch (removeError) {
      console.error(`Failed to remove a new photo's file after it wasn't swapped in (${url}):`, removeError);
    }
  };

  let refusal: PhotoRefusal | null;
  try {
    refusal = await db.$transaction(async (tx) => {
      // Only while the row still holds the URL staff saw: a replace or delete
      // in another tab since the read above changes nothing here, and a
      // second replace waiting on this row's lock finds the URL changed.
      const { count } = await tx.animalImage.updateMany({
        where: { id: imageId, animalId, url: expectedUrl },
        data: { url, focusY },
      });
      if (count === 0) {
        return missedRefusal(tx, input);
      }
      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.PHOTO_REPLACED,
          changedById: staffMemberId,
          changeSummary: `A photo was replaced. Old URL: ${expectedUrl} New URL: ${url}`,
        },
      });
      return null;
    });
  } catch (error) {
    // As in addAnimalPhoto: the commit may have landed with only its answer
    // lost, so look before removing the new file, and keep it if even the
    // look fails.
    let row: { id: string } | null;
    try {
      row = await db.animalImage.findFirst({ where: { id: imageId, animalId, url }, select: { id: true } });
    } catch (lookError) {
      console.error(`Couldn't tell whether a photo was swapped in, so its file is kept (${url}):`, lookError);
      throw error;
    }
    if (!row) {
      await removeNewFile();
      throw error;
    }
    refusal = null;
  }
  if (refusal) {
    await removeNewFile();
    return refusal;
  }

  try {
    await store.remove(expectedUrl);
  } catch (error) {
    // The new photo is in place either way; the old file is left behind.
    console.error(`Failed to remove a replaced photo's file (${expectedUrl}):`, error);
  }
  return { ok: true, imageId, url, replacedUrl: expectedUrl };
}

/**
 * Sets where one of the animal's photos sits in a wide frame (`focusY`, null
 * to centre it), without touching its file. Only while the row still holds
 * `expectedUrl`, the photo staff framed: one replaced in another tab meanwhile
 * is refused (409), since the framing was chosen for the old picture, and one
 * deleted meanwhile too (404). Logs nothing, as reordering logs nothing.
 */
export async function setAnimalPhotoFocus(
  db: Pick<Db, "animalImage">,
  input: { animalId: string; imageId: string; expectedUrl: string; focusY: number | null },
): Promise<{ ok: true; focusY: number | null } | PhotoRefusal> {
  const { animalId, imageId, expectedUrl, focusY } = input;
  assertFocusY(focusY);
  const { count } = await db.animalImage.updateMany({
    where: { id: imageId, animalId, url: expectedUrl },
    data: { focusY },
  });
  if (count === 0) {
    return missedRefusal(db, input);
  }
  return { ok: true, focusY };
}

/**
 * Deletes one of the animal's photos and logs `PHOTO_DELETED`, then removes
 * the photo's file: the one on its row, never a URL the caller gives. A file
 * the store didn't write (a seed photo's) is left alone. Refuses a photo that
 * isn't this animal's, or is gone already (404), and one replaced between the
 * read and the delete (409).
 */
export async function deleteAnimalPhoto(
  db: Db,
  store: AnimalPhotoStore,
  input: { animalId: string; imageId: string; staffMemberId: string },
): Promise<{ ok: true; url: string } | PhotoRefusal> {
  const { animalId, imageId, staffMemberId } = input;
  const url = await db.$transaction(async (tx): Promise<string | PhotoRefusal> => {
    const image = await tx.animalImage.findFirst({
      where: { id: imageId, animalId },
      select: { url: true },
    });
    if (!image) return { ok: false, status: 404, message: PHOTO_NOT_FOUND_MESSAGE };
    // Scoped by animal too, and by count: a delete in another tab since the
    // read deletes nothing here, and nothing is logged twice. And by the URL
    // read: a replace in another tab since then put a new file on the row,
    // which deleting it would leave behind, removing and logging the old one.
    const { count } = await tx.animalImage.deleteMany({ where: { id: imageId, animalId, url: image.url } });
    if (count === 0) return missedRefusal(tx, { animalId, imageId, expectedUrl: image.url });
    await tx.animalActivityLog.create({
      data: {
        animalId,
        activityType: AnimalActivityType.PHOTO_DELETED,
        changedById: staffMemberId,
        changeSummary: `A photo was deleted. URL: ${image.url}`,
      },
    });
    return image.url;
  });
  if (typeof url !== "string") {
    return url;
  }

  try {
    await store.remove(url);
  } catch (error) {
    // The photo is gone from the page either way; the file is left behind.
    console.error(`Failed to remove a deleted photo's file (${url}):`, error);
  }
  return { ok: true, url };
}
