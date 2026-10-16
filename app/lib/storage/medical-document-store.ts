/**
 * Where medical documents' files are kept. Server only: it reads the
 * environment and the disk.
 *
 * A document's file is private. Its row holds the store's key (a pathname),
 * never a URL, and the file reaches a browser only through a route that checks
 * who is asking. So every version here stores by pathname and hands the file
 * back as a stream:
 * - Blob: Vercel Blob with private access, under its own token
 *   (`MEDICAL_DOCUMENTS_BLOB_READ_WRITE_TOKEN`), apart from the photos' public
 *   store.
 * - Local: files on disk, for development without a token, the browser tests
 *   and CI.
 * - Memory: a map, for the database tests.
 *
 * `medicalDocumentStore()` picks one from the environment when it is called.
 * A missing token in production is reported when the store is used, never
 * when this module is imported, so a deployment without documents still
 * builds and serves every other page.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

export interface MedicalDocumentStore {
  /** Which store this is, for logs and tests. */
  readonly kind: "blob" | "local" | "memory" | "unavailable";
  /** Stores the file at `pathname`, refusing one already there unless the
   * store was made to overwrite. */
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** The file at `pathname`, or null when the store doesn't have it. */
  get(
    pathname: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null>;
  /** Deletes the file at `pathname`. Removing a file that isn't there does
   * nothing. */
  remove(pathname: string): Promise<void>;
}

export type MedicalDocumentStoreOptions = {
  /**
   * Replace a file already at the pathname instead of refusing it. Only the
   * seed passes it, writing its files to fixed pathnames so that seeding again
   * never piles up copies. An upload's pathname is always fresh.
   */
  overwrite?: boolean;
};

const PATH_PREFIX = "medical-documents";

/**
 * A fresh pathname for an uploaded document. The uploaded file's own name
 * never goes in it: a name can carry a person's name.
 */
export const newDocumentPathname = (animalId: string): string =>
  `${PATH_PREFIX}/${animalId}/${randomUUID()}`;

/** The fixed pathname the seed writes one of its files to. */
export const seedDocumentPathname = (fileName: string): string =>
  `${PATH_PREFIX}/seed/${fileName}`;

const streamOf = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

export function blobStore(
  token: string,
  { overwrite = false }: MedicalDocumentStoreOptions = {},
): MedicalDocumentStore {
  return {
    kind: "blob",
    async put(pathname, bytes, contentType) {
      await put(pathname, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
        access: "private",
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: overwrite,
      });
    },
    async get(pathname) {
      // Read from storage, never a cached copy: once a file is removed, the
      // file route must stop serving it at once.
      const result = await get(pathname, {
        access: "private",
        token,
        useCache: false,
      });
      if (!result || result.statusCode !== 200) return null;
      return { stream: result.stream, size: result.blob.size };
    },
    async remove(pathname) {
      await del(pathname, { token });
    },
  };
}

/**
 * Refuses a pathname that could reach outside the store's folder: one that is
 * empty, starts with a slash, holds a backslash or a NUL, or has a `..` or
 * `.` segment.
 */
function checkPathname(pathname: string): void {
  const segments = pathname.split("/");
  if (
    pathname === "" ||
    pathname.startsWith("/") ||
    pathname.includes("\\") ||
    pathname.includes("\0") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Not a medical document pathname: ${JSON.stringify(pathname)}.`);
  }
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export function localStore(
  dir: string,
  { overwrite = false }: MedicalDocumentStoreOptions = {},
): MedicalDocumentStore {
  const root = path.resolve(dir);
  const fileOf = (pathname: string): string => {
    checkPathname(pathname);
    return path.join(root, ...pathname.split("/"));
  };
  return {
    kind: "local",
    async put(pathname, bytes) {
      const file = fileOf(pathname);
      await mkdir(path.dirname(file), { recursive: true });
      try {
        await writeFile(file, bytes, { flag: overwrite ? "w" : "wx" });
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "EEXIST") {
          throw new Error(`A medical document is already stored at ${pathname}.`);
        }
        throw error;
      }
    },
    async get(pathname) {
      const file = fileOf(pathname);
      try {
        // Read whole: a document is at most a few megabytes, and a stream
        // over an open file would leak it if the reader never finished.
        const bytes = new Uint8Array(await readFile(file));
        return { stream: streamOf(bytes), size: bytes.byteLength };
      } catch (error) {
        if (isMissingFile(error)) return null;
        throw error;
      }
    },
    async remove(pathname) {
      await rm(fileOf(pathname), { force: true });
    },
  };
}

export type MemoryDocumentStore = MedicalDocumentStore & {
  /** What is stored at `pathname`, as stored. */
  read(pathname: string): { bytes: Uint8Array; contentType: string } | undefined;
  /** Every pathname that holds a file. */
  pathnames(): string[];
  /** Makes the next `put` fail with `error`, storing nothing. */
  failNextPut(error?: Error): void;
};

export function memoryStore({
  overwrite = false,
}: MedicalDocumentStoreOptions = {}): MemoryDocumentStore {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  let nextPutError: Error | null = null;
  return {
    kind: "memory",
    async put(pathname, bytes, contentType) {
      if (nextPutError) {
        const error = nextPutError;
        nextPutError = null;
        throw error;
      }
      if (!overwrite && files.has(pathname)) {
        throw new Error(`A medical document is already stored at ${pathname}.`);
      }
      files.set(pathname, { bytes: Uint8Array.from(bytes), contentType });
    },
    async get(pathname) {
      const file = files.get(pathname);
      if (!file) return null;
      return { stream: streamOf(Uint8Array.from(file.bytes)), size: file.bytes.byteLength };
    },
    async remove(pathname) {
      files.delete(pathname);
    },
    read: (pathname) => files.get(pathname),
    pathnames: () => [...files.keys()],
    failNextPut(error = new Error("The document store refused the file.")) {
      nextPutError = error;
    },
  };
}

/** A store that can't be used, saying why on every call. */
function unavailableStore(message: string): MedicalDocumentStore {
  const fail = async (): Promise<never> => {
    throw new Error(message);
  };
  return { kind: "unavailable", put: fail, get: fail, remove: fail };
}

export const MISSING_TOKEN_MESSAGE =
  "Medical documents need MEDICAL_DOCUMENTS_BLOB_READ_WRITE_TOKEN.";

export type MedicalDocumentStoreConfig =
  | { kind: "blob"; token: string }
  | { kind: "local"; dir: string }
  | { kind: "unavailable"; message: string };

/**
 * Which store the environment asks for:
 * - `MEDICAL_DOCUMENT_STORE=local`: the local store, whatever else is set.
 * - `MEDICAL_DOCUMENT_STORE=blob`: Blob, which needs the token.
 * - unset: Blob when the token is set; otherwise the local store, except in
 *   production, where files on a server's disk would be lost on the next
 *   deployment.
 *
 * The local store keeps its files in `MEDICAL_DOCUMENT_DIR`, or in
 * `.medical-documents/` in the folder the app runs from.
 */
export function medicalDocumentStoreConfig(
  env: Partial<Record<string, string | undefined>>,
  cwd: string = process.cwd(),
): MedicalDocumentStoreConfig {
  const mode = env.MEDICAL_DOCUMENT_STORE?.trim() || undefined;
  const token = env.MEDICAL_DOCUMENTS_BLOB_READ_WRITE_TOKEN?.trim() || undefined;
  const dir = env.MEDICAL_DOCUMENT_DIR?.trim() || path.join(cwd, ".medical-documents");

  if (mode === "local") return { kind: "local", dir };
  if (mode === "blob") {
    return token ? { kind: "blob", token } : { kind: "unavailable", message: MISSING_TOKEN_MESSAGE };
  }
  if (mode !== undefined) {
    return {
      kind: "unavailable",
      message: `MEDICAL_DOCUMENT_STORE must be "blob" or "local", not "${mode}".`,
    };
  }
  if (token) return { kind: "blob", token };
  if (env.NODE_ENV === "production") {
    return { kind: "unavailable", message: MISSING_TOKEN_MESSAGE };
  }
  return { kind: "local", dir };
}

/** The store the environment asks for (see `medicalDocumentStoreConfig`). */
export function medicalDocumentStore(
  options: MedicalDocumentStoreOptions = {},
  env: Partial<Record<string, string | undefined>> = process.env,
): MedicalDocumentStore {
  const config = medicalDocumentStoreConfig(env);
  switch (config.kind) {
    case "blob":
      return blobStore(config.token, options);
    case "local":
      return localStore(config.dir, options);
    case "unavailable":
      return unavailableStore(config.message);
  }
}
