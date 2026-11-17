import prisma from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { getCachedSession } from "@/app/lib/auth/session";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { readUploadedPhoto } from "@/app/lib/storage/photo-size";
import { animalPhotoStore } from "@/app/lib/storage/animal-photo-store";
import { addAnimalPhoto } from "@/app/lib/services/animal-photos";
import { cuidSchema } from "@/app/lib/zod-schemas/common.schemas";

/**
 * Adds one photo to an animal: the form's `file` and `animalId`. Checks who
 * is asking, then hands the photo to the photo service
 * (`app/lib/services/animal-photos.ts`), which refuses a file that isn't a
 * JPEG, PNG or WebP and an unknown animal, stores the file in the photo store
 * the environment picks, and records it.
 *
 * Answers 201 `{ url }`, or `{ error }` with a message staff can read: the
 * uploader (`components/dashboard/animals/photos/photo-uploader.tsx`) shows
 * a 4xx's `error` as it is. Beside it, `[name]/route.ts` serves photos from
 * the local photo store.
 */
export async function POST(request: Request) {
  const session = await getCachedSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized: You must be logged in." },
      { status: 401 },
    );
  }

  const isAuthorized = await hasPermission(AppPermissions.ANIMAL_PHOTO_MANAGE);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to upload files." },
      { status: 403 },
    );
  }

  const staffMemberId = session.user.personId;
  if (!staffMemberId) {
    return NextResponse.json(
      { error: "Your account is not associated with a person record." },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const uploaded = readUploadedPhoto(formData.get("file"));
    if (!("photo" in uploaded)) {
      return NextResponse.json(
        { error: uploaded.error },
        { status: uploaded.status },
      );
    }
    const animalId = cuidSchema.safeParse(formData.get("animalId"));
    if (!animalId.success) {
      return NextResponse.json(
        { error: "No animal was named for this photo. Reload the page and try again." },
        { status: 400 },
      );
    }

    const result = await addAnimalPhoto(prisma, animalPhotoStore(), {
      animalId: animalId.data,
      staffMemberId,
      bytes: new Uint8Array(await uploaded.photo.arrayBuffer()),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    return NextResponse.json({ url: result.url }, { status: 201 });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
