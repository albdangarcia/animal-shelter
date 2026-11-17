import type prisma from "@/app/lib/prisma";
import { AnimalActivityType } from "@/prisma/generated/enums";
import type { AnimalPhotoStore } from "@/app/lib/storage/animal-photo-store";
import { newPhotoName } from "@/app/lib/storage/animal-photo-store";
import { PHOTO_TOO_LARGE_MESSAGE, isPhotoTooLarge } from "@/app/lib/storage/photo-size";
import { checkPhotoType } from "@/app/lib/storage/photo-type";

/**
 * An animal's photos: adding one and deleting one, with their files in a
 * photo store (`app/lib/storage/animal-photo-store.ts`).
 *
 * Like the other services, this module has **no `next/*` and no auth
 * imports**, so the database tests can drive it; whoever calls it (the upload
 * route, the delete action) has checked who may. A refusal comes back as a
 * result with a message staff can read and the status the route answers with;
 * anything else that goes wrong is thrown.
 *
 * A store can't take part in a transaction, so the order of file and row is
 * chosen so that a failure never leaves a row without its file: adding puts
 * the file first and removes it again only once it is sure no row holds it;
 * deleting
 * removes the row first and the file after, so a failed removal leaves only a
 * stray file.
 */

type Db = typeof prisma;

export type PhotoRefusal = { ok: false; status: 400 | 404 | 413; message: string };

export const ANIMAL_NOT_FOUND_MESSAGE =
  "This animal wasn't found, so the photo wasn't added. Reload the page and try again.";

export const PHOTO_NOT_FOUND_MESSAGE =
  "This photo wasn't found. It may have been deleted in another tab. Reload the page.";

/**
 * Adds a photo at the end of the animal's photos and logs `PHOTO_UPLOADED`.
 * Refuses a file over the size limit, one that isn't a JPEG, PNG or WebP (read
 * from its first bytes) and an unknown animal, before anything is stored.
 */
export async function addAnimalPhoto(
  db: Db,
  store: AnimalPhotoStore,
  input: { animalId: string; staffMemberId: string; bytes: Uint8Array },
): Promise<{ ok: true; imageId: string; url: string } | PhotoRefusal> {
  const { animalId, staffMemberId, bytes } = input;
  if (isPhotoTooLarge(bytes.byteLength)) {
    return { ok: false, status: 413, message: PHOTO_TOO_LARGE_MESSAGE };
  }
  const type = checkPhotoType(bytes);
  if ("error" in type) {
    return { ok: false, status: 400, message: type.error };
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
        data: { url, animalId, sortOrder: (_max.sortOrder ?? -1) + 1 },
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
 * Deletes one of the animal's photos and logs `PHOTO_DELETED`, then removes
 * the photo's file: the one on its row, never a URL the caller gives. A file
 * the store didn't write (a seed photo's) is left alone. Refuses a photo that
 * isn't this animal's, or is gone already.
 */
export async function deleteAnimalPhoto(
  db: Db,
  store: AnimalPhotoStore,
  input: { animalId: string; imageId: string; staffMemberId: string },
): Promise<{ ok: true; url: string } | PhotoRefusal> {
  const { animalId, imageId, staffMemberId } = input;
  const url = await db.$transaction(async (tx) => {
    const image = await tx.animalImage.findFirst({
      where: { id: imageId, animalId },
      select: { url: true },
    });
    if (!image) return null;
    // Scoped by animal too, and by count: a delete in another tab since the
    // read deletes nothing here, and nothing is logged twice.
    const { count } = await tx.animalImage.deleteMany({ where: { id: imageId, animalId } });
    if (count === 0) return null;
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
  if (url === null) {
    return { ok: false, status: 404, message: PHOTO_NOT_FOUND_MESSAGE };
  }

  try {
    await store.remove(url);
  } catch (error) {
    // The photo is gone from the page either way; the file is left behind.
    console.error(`Failed to remove a deleted photo's file (${url}):`, error);
  }
  return { ok: true, url };
}
