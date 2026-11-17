import {
  animalPhotoStoreConfig,
  readLocalPhoto,
} from "@/app/lib/storage/animal-photo-store";

const notFound = () =>
  new Response("Not found.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

/**
 * Serves a photo the local photo store keeps on disk
 * (`app/lib/storage/animal-photo-store.ts`): in development without a Blob
 * token and in the browser tests. Photos are public, as Blob's are, so it
 * checks no session. Anywhere the local store isn't the one in use, production
 * included, it answers 404.
 *
 * A name is a fresh UUID for every photo and never reused, so the file may be
 * cached for good. `nosniff` keeps the browser to the type its extension says,
 * which was read from the file's first bytes when it was stored.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/animal-photos/[name]">,
) {
  const config = animalPhotoStoreConfig(process.env);
  if (config.kind !== "local") return notFound();

  const { name } = await ctx.params;
  const photo = await readLocalPhoto(config.dir, name);
  if (!photo) return notFound();

  return new Response(Buffer.from(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
