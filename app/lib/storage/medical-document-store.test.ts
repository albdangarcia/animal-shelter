import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  localStore,
  medicalDocumentStore,
  medicalDocumentStoreConfig,
  memoryStore,
  MISSING_TOKEN_MESSAGE,
  newDocumentPathname,
  seedDocumentPathname,
  type MedicalDocumentStore,
} from "./medical-document-store";

const PDF = new TextEncoder().encode("%PDF-1.4 a tiny document");

async function readAll(store: MedicalDocumentStore, pathname: string) {
  const file = await store.get(pathname);
  if (!file) return null;
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  return { bytes, size: file.size };
}

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "medical-documents-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("the local store puts, reads and removes a file under its folder", async () => {
  await withTempDir(async (dir) => {
    const store = localStore(dir);
    const pathname = "medical-documents/animal-1/abc";

    await store.put(pathname, PDF, "application/pdf");
    assert.deepEqual(
      new Uint8Array(await readFile(path.join(dir, "medical-documents", "animal-1", "abc"))),
      PDF,
    );
    assert.deepEqual(await readAll(store, pathname), { bytes: PDF, size: PDF.byteLength });

    await store.remove(pathname);
    assert.equal(await store.get(pathname), null);
    // Removing it again does nothing.
    await store.remove(pathname);
  });
});

test("the local store reads a missing file as null", async () => {
  await withTempDir(async (dir) => {
    assert.equal(await localStore(dir).get("medical-documents/animal-1/none"), null);
  });
});

test("the local store refuses a second file at a pathname unless it overwrites", async () => {
  await withTempDir(async (dir) => {
    const pathname = "medical-documents/seed/report.pdf";
    await localStore(dir).put(pathname, PDF, "application/pdf");

    await assert.rejects(
      localStore(dir).put(pathname, new Uint8Array([1]), "application/pdf"),
      /already stored at medical-documents\/seed\/report\.pdf/,
    );
    assert.deepEqual((await readAll(localStore(dir), pathname))?.bytes, PDF);

    await localStore(dir, { overwrite: true }).put(pathname, new Uint8Array([1]), "application/pdf");
    assert.deepEqual((await readAll(localStore(dir), pathname))?.bytes, new Uint8Array([1]));
  });
});

test("the local store refuses a pathname that could leave its folder", async () => {
  await withTempDir(async (dir) => {
    const store = localStore(path.join(dir, "store"));
    for (const pathname of [
      "../outside",
      "medical-documents/../../outside",
      "/etc/passwd",
      "medical-documents/./a",
      "medical-documents//a",
      "medical-documents\\..\\a",
      "",
    ]) {
      await assert.rejects(store.put(pathname, PDF, "application/pdf"), /Not a medical document pathname/);
      await assert.rejects(store.get(pathname), /Not a medical document pathname/);
      await assert.rejects(store.remove(pathname), /Not a medical document pathname/);
    }
    assert.deepEqual(await readdir(dir), []);
  });
});

test("the memory store keeps what was put, reads it back and removes it", async () => {
  const store = memoryStore();
  await store.put("medical-documents/a/1", PDF, "application/pdf");

  assert.deepEqual(store.pathnames(), ["medical-documents/a/1"]);
  assert.deepEqual(store.read("medical-documents/a/1"), {
    bytes: PDF,
    contentType: "application/pdf",
  });
  assert.deepEqual(await readAll(store, "medical-documents/a/1"), {
    bytes: PDF,
    size: PDF.byteLength,
  });
  await assert.rejects(store.put("medical-documents/a/1", PDF, "application/pdf"), /already stored/);

  await store.remove("medical-documents/a/1");
  assert.equal(await store.get("medical-documents/a/1"), null);
  assert.deepEqual(store.pathnames(), []);
});

test("the memory store can be made to fail its next put, and only that one", async () => {
  const store = memoryStore();
  store.failNextPut(new Error("Store is down."));

  await assert.rejects(store.put("medical-documents/a/1", PDF, "application/pdf"), /Store is down\./);
  assert.deepEqual(store.pathnames(), []);

  await store.put("medical-documents/a/1", PDF, "application/pdf");
  assert.deepEqual(store.pathnames(), ["medical-documents/a/1"]);
});

test("the memory store copies the bytes it is given", async () => {
  const store = memoryStore();
  const bytes = Uint8Array.from(PDF);
  await store.put("medical-documents/a/1", bytes, "application/pdf");
  bytes[0] = 0;
  assert.deepEqual(store.read("medical-documents/a/1")?.bytes, PDF);
});

test("an upload's pathname is fresh and holds only the animal's id", () => {
  const first = newDocumentPathname("animal-1");
  const second = newDocumentPathname("animal-1");
  assert.match(first, /^medical-documents\/animal-1\/[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
  assert.equal(seedDocumentPathname("radiograph.png"), "medical-documents/seed/radiograph.png");
});

test("the picker: local when asked, whatever else is set", () => {
  assert.deepEqual(
    medicalDocumentStoreConfig(
      {
        MEDICAL_DOCUMENT_STORE: "local",
        MEDICAL_DOCUMENT_DIR: "/tmp/e2e-documents",
        MEDICAL_DOCUMENTS_BLOB_READ_WRITE_TOKEN: "token",
        NODE_ENV: "production",
      },
      "/app",
    ),
    { kind: "local", dir: "/tmp/e2e-documents" },
  );
});

test("the picker: Blob when asked, which needs the token", () => {
  assert.deepEqual(
    medicalDocumentStoreConfig({
      MEDICAL_DOCUMENT_STORE: "blob",
      MEDICAL_DOCUMENTS_BLOB_READ_WRITE_TOKEN: "token",
    }),
    { kind: "blob", token: "token" },
  );
  assert.deepEqual(medicalDocumentStoreConfig({ MEDICAL_DOCUMENT_STORE: "blob" }), {
    kind: "unavailable",
    message: MISSING_TOKEN_MESSAGE,
  });
  // The photos' token is not the documents' token.
  assert.equal(
    medicalDocumentStoreConfig({ MEDICAL_DOCUMENT_STORE: "blob", BLOB_READ_WRITE_TOKEN: "photos" }).kind,
    "unavailable",
  );
});

test("the picker: unset, Blob with a token, else local in the app's folder", () => {
  assert.deepEqual(medicalDocumentStoreConfig({ MEDICAL_DOCUMENTS_BLOB_READ_WRITE_TOKEN: "token" }), {
    kind: "blob",
    token: "token",
  });
  assert.deepEqual(medicalDocumentStoreConfig({ NODE_ENV: "development" }, "/app"), {
    kind: "local",
    dir: path.join("/app", ".medical-documents"),
  });
  assert.deepEqual(
    medicalDocumentStoreConfig({ MEDICAL_DOCUMENT_STORE: " ", MEDICAL_DOCUMENTS_BLOB_READ_WRITE_TOKEN: " " }, "/app"),
    { kind: "local", dir: path.join("/app", ".medical-documents") },
  );
});

test("the picker: an unknown store name is unavailable, saying what it takes", () => {
  assert.deepEqual(medicalDocumentStoreConfig({ MEDICAL_DOCUMENT_STORE: "s3" }), {
    kind: "unavailable",
    message: 'MEDICAL_DOCUMENT_STORE must be "blob" or "local", not "s3".',
  });
});

test("in production without a token, the store throws when used, not when made", async () => {
  const store = medicalDocumentStore({}, { NODE_ENV: "production" });
  assert.equal(store.kind, "unavailable");
  await assert.rejects(store.put("medical-documents/a/1", PDF, "application/pdf"), {
    message: MISSING_TOKEN_MESSAGE,
  });
  await assert.rejects(store.get("medical-documents/a/1"), { message: MISSING_TOKEN_MESSAGE });
  await assert.rejects(store.remove("medical-documents/a/1"), { message: MISSING_TOKEN_MESSAGE });
});

test("the picker builds the store it names", async () => {
  await withTempDir(async (dir) => {
    const local = medicalDocumentStore({}, { MEDICAL_DOCUMENT_STORE: "local", MEDICAL_DOCUMENT_DIR: dir });
    assert.equal(local.kind, "local");
    await local.put("medical-documents/a/1", PDF, "application/pdf");
    assert.deepEqual((await readAll(local, "medical-documents/a/1"))?.bytes, PDF);

    const overwriting = medicalDocumentStore(
      { overwrite: true },
      { MEDICAL_DOCUMENT_STORE: "local", MEDICAL_DOCUMENT_DIR: dir },
    );
    await overwriting.put("medical-documents/a/1", new Uint8Array([7]), "application/pdf");
    assert.deepEqual((await readAll(local, "medical-documents/a/1"))?.bytes, new Uint8Array([7]));
  });
  assert.equal(
    medicalDocumentStore({}, { MEDICAL_DOCUMENTS_BLOB_READ_WRITE_TOKEN: "token" }).kind,
    "blob",
  );
});
