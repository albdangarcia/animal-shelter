/**
 * Where animal photos' files are kept. Server only: it reads the environment
 * and the disk.
 *
 * A photo is public: every page hands its URL to `next/image`, so a store's
 * `put` returns the URL the photo is shown from, and `AnimalImage.url` holds
 * it. Versions:
 * - Blob: Vercel Blob with public access, under `BLOB_READ_WRITE_TOKEN`,
 *   passed explicitly so that no other Blob variable (`BLOB_STORE_ID`) can
 *   send photos to another store.
 * - Local: files on disk, served by `/api/animal-photos/<name>`, for
 *   development without a token and the browser tests. Never in production.
 * - Memory: a map, for the database tests.
 *
 * A store's `remove` deletes only a file that store wrote. Any other URL, such
 * as a seed photo's `/seed-images/...` path or another store's URL, is left
 * alone, so deleting a photo's row never reaches a file that isn't the store's.
 *
 * `animalPhotoStore()` picks one from the environment when it is called. A
 * missing token in production is reported when the store is used, never when
 * this module is imported.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";

/** The content types a photo can have, and the extension each is saved with. */
export const PHOTO_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type PhotoContentType = keyof typeof PHOTO_EXTENSIONS;

export interface AnimalPhotoStore {
  /** Which store this is, for logs and tests. */
  readonly kind: "blob" | "local" | "memory" | "unavailable";
  /** Stores the photo under `name` (from `newPhotoName`) and answers the URL
   * it is shown from. */
  put(name: string, bytes: Uint8Array, contentType: PhotoContentType): Promise<string>;
  /** Deletes the file at `url` if this store wrote it; does nothing for any
   * other URL, or for a file already gone. */
  remove(url: string): Promise<void>;
}

/** A stored photo's name: a fresh UUID and its extension. The uploaded file's
 * own name never goes in it. */
export const PHOTO_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const newPhotoName = (contentType: PhotoContentType): string =>
  `${randomUUID()}.${PHOTO_EXTENSIONS[contentType]}`;

const contentTypeOf = (name: string): PhotoContentType | null => {
  const entry = Object.entries(PHOTO_EXTENSIONS).find(([, extension]) =>
    name.endsWith(`.${extension}`),
  );
  return entry ? (entry[0] as PhotoContentType) : null;
};

const checkName = (name: string) => {
  if (!PHOTO_NAME.test(name)) {
    throw new Error(`Not an animal photo name: ${JSON.stringify(name)}.`);
  }
};

// ---------------------------------------------------------------------------
// Blob
// ---------------------------------------------------------------------------

/** The folder photos have always gone into in the Blob store. */
export const BLOB_PHOTO_FOLDER = "animalShelterUserUploads";

/** The store id a read-write token names (`vercel_blob_rw_<id>_<secret>`), as
 * `@vercel/blob` reads it. */
const storeIdOf = (token: string): string => token.split("_")[3] ?? "";

/**
 * Whether `url` is a photo in the Blob store `token` opens: on that store's
 * public host and in the photos' folder. Uploads from before this store
 * existed qualify too.
 */
export function isBlobPhotoUrl(url: string, token: string): boolean {
  const storeId = storeIdOf(token).toLowerCase();
  if (!storeId) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname.toLowerCase() === `${storeId}.public.blob.vercel-storage.com` &&
    parsed.pathname.startsWith(`/${BLOB_PHOTO_FOLDER}/`)
  );
}

export function blobPhotoStore(token: string): AnimalPhotoStore {
  return {
    kind: "blob",
    async put(name, bytes, contentType) {
      checkName(name);
      const pathname = `${BLOB_PHOTO_FOLDER}/${name}`;
      try {
        const blob = await put(
          pathname,
          Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
          { access: "public", token, contentType, addRandomSuffix: false },
        );
        return blob.url;
      } catch (error) {
        // A failed put may still have stored the file, its answer lost on the
        // way back. The name is fresh, so the only file it can hold is this
        // one: remove it, or it stays public with no row pointing at it.
        await del(pathname, { token }).catch((removeError: unknown) => {
          console.error(`Failed to remove a photo after its upload failed (${pathname}):`, removeError);
        });
        throw error;
      }
    },
    async remove(url) {
      if (!isBlobPhotoUrl(url, token)) return;
      await del(url, { token });
    },
  };
}

// ---------------------------------------------------------------------------
// Local
// ---------------------------------------------------------------------------

/** Where the local store's photos are served from. */
export const LOCAL_PHOTO_URL_PREFIX = "/api/animal-photos/";

/** The name in a local photo's URL, or null when the URL isn't one. */
export function localPhotoName(url: string): string | null {
  if (!url.startsWith(LOCAL_PHOTO_URL_PREFIX)) return null;
  const name = url.slice(LOCAL_PHOTO_URL_PREFIX.length);
  return PHOTO_NAME.test(name) ? name : null;
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** A photo the local store keeps in `dir`, or null when it has none by that
 * name. */
export async function readLocalPhoto(
  dir: string,
  name: string,
): Promise<{ bytes: Uint8Array; contentType: PhotoContentType } | null> {
  const contentType = contentTypeOf(name);
  if (!PHOTO_NAME.test(name) || !contentType) return null;
  try {
    const bytes = new Uint8Array(await readFile(path.join(path.resolve(dir), name)));
    return { bytes, contentType };
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export function localPhotoStore(dir: string): AnimalPhotoStore {
  const root = path.resolve(dir);
  return {
    kind: "local",
    async put(name, bytes) {
      checkName(name);
      await mkdir(root, { recursive: true });
      await writeFile(path.join(root, name), bytes, { flag: "wx" });
      return `${LOCAL_PHOTO_URL_PREFIX}${name}`;
    },
    async remove(url) {
      const name = localPhotoName(url);
      if (!name) return;
      await rm(path.join(root, name), { force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

const MEMORY_URL_PREFIX = "memory://animal-photos/";

export type MemoryPhotoStore = AnimalPhotoStore & {
  /** What is stored at `url`, as stored. */
  read(url: string): { bytes: Uint8Array; contentType: PhotoContentType } | undefined;
  /** Every URL that holds a photo. */
  urls(): string[];
  /** Every URL `remove` was called with, in order, the store's or not. */
  removeCalls(): string[];
  /** Makes the next `put` fail with `error`, storing nothing. */
  failNextPut(error?: Error): void;
  /** Makes the next `remove` of one of its own files fail with `error`,
   * removing nothing. */
  failNextRemove(error?: Error): void;
};

export function memoryPhotoStore(): MemoryPhotoStore {
  const files = new Map<string, { bytes: Uint8Array; contentType: PhotoContentType }>();
  const removeCalls: string[] = [];
  let nextPutError: Error | null = null;
  let nextRemoveError: Error | null = null;
  return {
    kind: "memory",
    async put(name, bytes, contentType) {
      checkName(name);
      if (nextPutError) {
        const error = nextPutError;
        nextPutError = null;
        throw error;
      }
      const url = `${MEMORY_URL_PREFIX}${name}`;
      if (files.has(url)) throw new Error(`A photo is already stored at ${url}.`);
      files.set(url, { bytes: Uint8Array.from(bytes), contentType });
      return url;
    },
    async remove(url) {
      removeCalls.push(url);
      if (!url.startsWith(MEMORY_URL_PREFIX)) return;
      if (nextRemoveError) {
        const error = nextRemoveError;
        nextRemoveError = null;
        throw error;
      }
      files.delete(url);
    },
    read: (url) => files.get(url),
    urls: () => [...files.keys()],
    removeCalls: () => [...removeCalls],
    failNextPut(error = new Error("The photo store refused the file.")) {
      nextPutError = error;
    },
    failNextRemove(error = new Error("The photo store couldn't remove the file.")) {
      nextRemoveError = error;
    },
  };
}

// ---------------------------------------------------------------------------
// Picking one
// ---------------------------------------------------------------------------

/** A store that can't be used, saying why on every call. */
function unavailablePhotoStore(message: string): AnimalPhotoStore {
  const fail = async (): Promise<never> => {
    throw new Error(message);
  };
  return { kind: "unavailable", put: fail, remove: fail };
}

export const MISSING_PHOTO_TOKEN_MESSAGE = "Animal photos need BLOB_READ_WRITE_TOKEN.";

export const LOCAL_PHOTOS_IN_PRODUCTION_MESSAGE =
  "Animal photos can't be kept on the server's disk in production. Set BLOB_READ_WRITE_TOKEN.";

export type AnimalPhotoStoreConfig =
  | { kind: "blob"; token: string }
  | { kind: "local"; dir: string }
  | { kind: "unavailable"; message: string };

/**
 * Which store the environment asks for:
 * - `ANIMAL_PHOTO_STORE=local`: the local store, whatever else is set.
 * - `ANIMAL_PHOTO_STORE=blob`: Blob, which needs `BLOB_READ_WRITE_TOKEN`.
 * - unset: Blob when the token is set; otherwise the local store.
 *
 * Never the local store in production: its files would be lost on the next
 * deployment, and its route serves nothing there.
 *
 * The local store keeps its files in `ANIMAL_PHOTO_DIR`, or in
 * `.animal-photos/` in the folder the app runs from.
 */
export function animalPhotoStoreConfig(
  env: Partial<Record<string, string | undefined>>,
  cwd: string = process.cwd(),
): AnimalPhotoStoreConfig {
  const mode = env.ANIMAL_PHOTO_STORE?.trim() || undefined;
  const token = env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
  const dir = env.ANIMAL_PHOTO_DIR?.trim() || path.join(cwd, ".animal-photos");
  const production = env.NODE_ENV === "production";

  if (mode === "local") {
    return production
      ? { kind: "unavailable", message: LOCAL_PHOTOS_IN_PRODUCTION_MESSAGE }
      : { kind: "local", dir };
  }
  if (mode === "blob") {
    return token
      ? { kind: "blob", token }
      : { kind: "unavailable", message: MISSING_PHOTO_TOKEN_MESSAGE };
  }
  if (mode !== undefined) {
    return {
      kind: "unavailable",
      message: `ANIMAL_PHOTO_STORE must be "blob" or "local", not "${mode}".`,
    };
  }
  if (token) return { kind: "blob", token };
  if (production) return { kind: "unavailable", message: MISSING_PHOTO_TOKEN_MESSAGE };
  return { kind: "local", dir };
}

/** The store the environment asks for (see `animalPhotoStoreConfig`). */
export function animalPhotoStore(
  env: Partial<Record<string, string | undefined>> = process.env,
): AnimalPhotoStore {
  const config = animalPhotoStoreConfig(env);
  switch (config.kind) {
    case "blob":
      return blobPhotoStore(config.token);
    case "local":
      return localPhotoStore(config.dir);
    case "unavailable":
      return unavailablePhotoStore(config.message);
  }
}
