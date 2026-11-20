import prisma from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCachedSession } from "@/app/lib/auth/session";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { readUploadedPhoto } from "@/app/lib/storage/photo-size";
import { animalPhotoStore } from "@/app/lib/storage/animal-photo-store";
import { replaceAnimalPhoto } from "@/app/lib/services/animal-photos";
import { cuidSchema } from "@/app/lib/zod-schemas/common.schemas";
import { parseFocusY } from "@/app/lib/utils/photo-focus";

const replaceFormSchema = z.object({
  animalId: cuidSchema,
  imageId: cuidSchema,
  expectedUrl: z.string().trim().min(1),
});

/**
 * Replaces one of an animal's photos with a new one, in the same place: the
 * form's `file`, `animalId`, `imageId` and `expectedUrl` (the URL the gallery
 * showed), and an optional `focusY` (where the new photo sits in a wide frame;
 * empty is centred). Checks who is asking, as the upload route beside it does, then
 * hands the photo to the photo service (`app/lib/services/animal-photos.ts`),
 * which refuses a photo that isn't the animal's, or was deleted or replaced
 * since the page was loaded, swaps the file on the photo's row and removes the
 * old one.
 *
 * Answers 200 `{ url }`, or `{ error }` with a message staff can read: the
 * replace dialog (`components/dashboard/animals/photos/photo-replace-dialog.tsx`)
 * shows a 4xx's `error` as it is.
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
    const fields = replaceFormSchema.safeParse({
      animalId: formData.get("animalId"),
      imageId: formData.get("imageId"),
      expectedUrl: formData.get("expectedUrl"),
    });
    if (!fields.success) {
      return NextResponse.json(
        { error: "No photo was named to replace. Reload the page and try again." },
        { status: 400 },
      );
    }
    const { animalId, imageId, expectedUrl } = fields.data;
    const focus = parseFocusY(formData.get("focusY"));
    if ("error" in focus) {
      return NextResponse.json({ error: focus.error }, { status: 400 });
    }

    const result = await replaceAnimalPhoto(prisma, animalPhotoStore(), {
      animalId,
      imageId,
      expectedUrl,
      staffMemberId,
      bytes: new Uint8Array(await uploaded.photo.arrayBuffer()),
      focusY: focus.focusY,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }

    // As for a delete: the Photos tab and the animal page (its section cards
    // show the primary photo), the public listing and detail page, and the
    // home page, which shows primary photos.
    revalidatePath(`/dashboard/animals/${animalId}/photos`);
    revalidatePath(`/dashboard/animals/${animalId}`);
    revalidatePath(`/pets/${animalId}`);
    revalidatePath("/pets");
    revalidatePath("/");

    return NextResponse.json({ url: result.url }, { status: 200 });
  } catch (error) {
    console.error("Replacing a photo failed:", error);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
