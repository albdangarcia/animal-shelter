import type { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { getCachedSession } from "@/app/lib/auth/session";
import { can } from "@/app/lib/auth/can";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { cuidSchema } from "@/app/lib/zod-schemas/common.schemas";
import { findDocumentForFile } from "@/app/lib/data/animals/medical-document";
import { findOpenPlacement } from "@/app/lib/data/fosters/foster-access";
import { medicalDocumentStore } from "@/app/lib/storage/medical-document-store";
import { documentContentDisposition } from "@/app/lib/utils/medical-document-file";

// On every answer, errors included: it is for this viewer only and never
// kept, and the browser takes it as the type it says and nothing else.
const PRIVATE = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const text = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: { ...PRIVATE, "Content-Type": "text/plain; charset=utf-8" },
  });

// The same answer for a document that doesn't exist and one the viewer may
// not see, so the route never confirms that a document exists.
const notFound = () => text("Not found.", 404);

/**
 * Serves a medical document's file, only after checking who is asking: never
 * on the strength of its URL, and never from a cache.
 *
 * Whoever reads medical records (`MEDICAL_READ`) gets any document's file,
 * voided ones included. A foster gets the file of a live document of an
 * animal they foster now. Anyone else gets a 404. A file removed from a
 * voided document answers 410; one the store doesn't have, 404.
 *
 * The file is shown in the browser (`?download=1` saves it instead), with the
 * content type its bytes were read as when it was uploaded and `nosniff`, so
 * the browser takes it as nothing else.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/medical-documents/[id]">,
) {
  const { id } = await ctx.params;
  if (!cuidSchema.safeParse(id).success) return notFound();

  const session = await getCachedSession();
  if (!session?.user) return notFound();
  const document = await findDocumentForFile(prisma, id);
  if (!document) return notFound();

  const { role, personId } = session.user;
  const allowed =
    can(role, AppPermissions.MEDICAL_READ) ||
    (can(role, AppPermissions.MY_FOSTER_ANIMALS_CARE) &&
      !document.voided &&
      !!personId &&
      (await findOpenPlacement(prisma, personId, document.animalId)) !== null);
  if (!allowed) return notFound();

  if (document.fileRemoved) return text("This file was removed.", 410);

  let file: Awaited<ReturnType<ReturnType<typeof medicalDocumentStore>["get"]>>;
  try {
    file = await medicalDocumentStore().get(document.pathname);
  } catch (error) {
    console.error("Failed to read a medical document's file:", error);
    return text("This file couldn't be read.", 500);
  }
  if (!file) return text("This file isn't available.", 404);

  const download = request.nextUrl.searchParams.get("download") === "1";
  return new Response(file.stream, {
    headers: {
      ...PRIVATE,
      "Content-Type": document.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": documentContentDisposition(
        document.name,
        document.contentType,
        download ? "attachment" : "inline",
      ),
    },
  });
}
