import { put, del } from "@vercel/blob";
import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AnimalActivityType } from "@prisma/client";

export async function POST(request: Request) {
  const session = await auth();
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

  let blobUrl: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const animalId = formData.get("animalId") as string;

    if (!file) {
      return NextResponse.json({ error: "No file found." }, { status: 400 });
    }

    // upload to blob
    const blob = await put(`animalShelterUserUploads/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    blobUrl = blob.url; // only used for cleanup on failure

    // save to DB
    await prisma.$transaction(async (tx) => {
      await tx.animalImage.create({
        data: { url: blob.url, animalId },
      });

      await tx.animalActivityLog.create({
        data: {
          animalId,
          activityType: AnimalActivityType.PHOTO_UPLOADED,
          changedById: staffMemberId,
          changeSummary: `A new photo was uploaded. URL: ${blob.url}`,
        },
      });
    });

    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (error) {
    if (blobUrl) {
      await del(blobUrl).catch(() => {});
    }
    console.error("Upload failed:", error);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
