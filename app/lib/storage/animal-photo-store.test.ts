import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  LOCAL_PHOTOS_IN_PRODUCTION_MESSAGE,
  MISSING_PHOTO_TOKEN_MESSAGE,
  animalPhotoStore,
  animalPhotoStoreConfig,
  isBlobPhotoUrl,
  localPhotoName,
  localPhotoStore,
  memoryPhotoStore,
  newPhotoName,
  readLocalPhoto,
} from "./animal-photo-store";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const TOKEN = "vercel_blob_rw_AbCd1234_secretpart";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "animal-photos-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a new photo's name is a fresh UUID with its type's extension", () => {
  const name = newPhotoName("image/jpeg");
  assert.match(name, /^[0-9a-f-]{36}\.jpg$/);
  assert.notEqual(newPhotoName("image/jpeg"), name);
  assert.match(newPhotoName("image/png"), /\.png$/);
  assert.match(newPhotoName("image/webp"), /\.webp$/);
});

test("the local store puts a photo, serves its URL and removes it", async () => {
  await withTempDir(async (dir) => {
    const store = localPhotoStore(dir);
    const name = newPhotoName("image/jpeg");

    const url = await store.put(name, JPEG, "image/jpeg");
    assert.equal(url, `/api/animal-photos/${name}`);
    assert.deepEqual(new Uint8Array(await readFile(path.join(dir, name))), JPEG);
    assert.deepEqual(await readLocalPhoto(dir, name), { bytes: JPEG, contentType: "image/jpeg" });

    await store.remove(url);
    assert.deepEqual(await readdir(dir), []);
    assert.equal(await readLocalPhoto(dir, name), null);
    // Removing it again does nothing.
    await store.remove(url);
  });
});

test("the local store leaves alone any URL it didn't write", async () => {
  await withTempDir(async (dir) => {
    const name = newPhotoName("image/png");
    await writeFile(path.join(dir, name), JPEG);
    const store = localPhotoStore(dir);

    for (const url of [
      "/seed-images/dogs/rex.webp",
      `https://abcd1234.public.blob.vercel-storage.com/animalShelterUserUploads/${name}`,
      `/api/animal-photos/../${name}`,
      "/api/animal-photos/not-a-photo-name.png",
    ]) {
      await store.remove(url);
    }
    assert.deepEqual(await readdir(dir), [name]);
  });
});

test("the local store refuses a name that isn't a photo name", async () => {
  await withTempDir(async (dir) => {
    for (const name of ["../outside.jpg", "rex.jpg", `${newPhotoName("image/jpeg")}.pdf`]) {
      await assert.rejects(localPhotoStore(dir).put(name, JPEG, "image/jpeg"), /Not an animal photo name/);
      assert.equal(await readLocalPhoto(dir, name), null);
    }
  });
});

test("a local photo's name is read only from the local route's URLs", () => {
  const name = newPhotoName("image/webp");
  assert.equal(localPhotoName(`/api/animal-photos/${name}`), name);
  assert.equal(localPhotoName(`/api/animal-photos/${name}?v=1`), null);
  assert.equal(localPhotoName(`/seed-images/${name}`), null);
});

test("a Blob photo URL is the store's only on its host, in the photos' folder", () => {
  const host = "https://abcd1234.public.blob.vercel-storage.com";
  assert.equal(isBlobPhotoUrl(`${host}/animalShelterUserUploads/rex-x1y2.jpg`, TOKEN), true);
  // Another store, the private documents' host, another folder, a seed path.
  assert.equal(
    isBlobPhotoUrl("https://other999.public.blob.vercel-storage.com/animalShelterUserUploads/rex.jpg", TOKEN),
    false,
  );
  assert.equal(
    isBlobPhotoUrl("https://abcd1234.private.blob.vercel-storage.com/animalShelterUserUploads/rex.jpg", TOKEN),
    false,
  );
  assert.equal(isBlobPhotoUrl(`${host}/medical-documents/a/b`, TOKEN), false);
  assert.equal(isBlobPhotoUrl("/seed-images/dogs/rex.webp", TOKEN), false);
  assert.equal(isBlobPhotoUrl(`${host}/animalShelterUserUploads/rex.jpg`, "not-a-token"), false);
});

test("the memory store records what was put and removes only its own files", async () => {
  const store = memoryPhotoStore();
  const url = await store.put(newPhotoName("image/jpeg"), JPEG, "image/jpeg");
  assert.deepEqual(store.read(url), { bytes: JPEG, contentType: "image/jpeg" });
  assert.deepEqual(store.urls(), [url]);

  await store.remove("/seed-images/dogs/rex.webp");
  assert.deepEqual(store.urls(), [url]);
  await store.remove(url);
  assert.deepEqual(store.urls(), []);
  assert.deepEqual(store.removeCalls(), ["/seed-images/dogs/rex.webp", url]);

  store.failNextPut();
  await assert.rejects(store.put(newPhotoName("image/png"), JPEG, "image/png"), /refused/);
  assert.deepEqual(store.urls(), []);
});

test("ANIMAL_PHOTO_STORE=local picks the local store, even with a token", () => {
  assert.deepEqual(
    animalPhotoStoreConfig({ ANIMAL_PHOTO_STORE: "local", BLOB_READ_WRITE_TOKEN: TOKEN }, "/app"),
    { kind: "local", dir: path.join("/app", ".animal-photos") },
  );
  assert.deepEqual(
    animalPhotoStoreConfig({ ANIMAL_PHOTO_STORE: " local ", ANIMAL_PHOTO_DIR: "/tmp/photos" }, "/app"),
    { kind: "local", dir: "/tmp/photos" },
  );
});

test("ANIMAL_PHOTO_STORE=blob needs the token", () => {
  assert.deepEqual(
    animalPhotoStoreConfig({ ANIMAL_PHOTO_STORE: "blob", BLOB_READ_WRITE_TOKEN: TOKEN }),
    { kind: "blob", token: TOKEN },
  );
  assert.deepEqual(animalPhotoStoreConfig({ ANIMAL_PHOTO_STORE: "blob", BLOB_READ_WRITE_TOKEN: " " }), {
    kind: "unavailable",
    message: MISSING_PHOTO_TOKEN_MESSAGE,
  });
});

test("an unknown ANIMAL_PHOTO_STORE is refused", () => {
  assert.deepEqual(animalPhotoStoreConfig({ ANIMAL_PHOTO_STORE: "s3" }), {
    kind: "unavailable",
    message: 'ANIMAL_PHOTO_STORE must be "blob" or "local", not "s3".',
  });
});

test("unset, the store is Blob with a token and local without, except in production", () => {
  assert.deepEqual(animalPhotoStoreConfig({ BLOB_READ_WRITE_TOKEN: TOKEN }), { kind: "blob", token: TOKEN });
  assert.deepEqual(animalPhotoStoreConfig({}, "/app"), {
    kind: "local",
    dir: path.join("/app", ".animal-photos"),
  });
  assert.deepEqual(animalPhotoStoreConfig({ NODE_ENV: "production" }), {
    kind: "unavailable",
    message: MISSING_PHOTO_TOKEN_MESSAGE,
  });
  assert.deepEqual(
    animalPhotoStoreConfig({ NODE_ENV: "production", BLOB_READ_WRITE_TOKEN: TOKEN }),
    { kind: "blob", token: TOKEN },
  );
});

test("the local store is never used in production, even when asked for", () => {
  assert.deepEqual(animalPhotoStoreConfig({ NODE_ENV: "production", ANIMAL_PHOTO_STORE: "local" }), {
    kind: "unavailable",
    message: LOCAL_PHOTOS_IN_PRODUCTION_MESSAGE,
  });
});

test("an unavailable store says why when it is used, not when it is made", async () => {
  const store = animalPhotoStore({ NODE_ENV: "production" });
  assert.equal(store.kind, "unavailable");
  await assert.rejects(store.put(newPhotoName("image/jpeg"), JPEG, "image/jpeg"), {
    message: MISSING_PHOTO_TOKEN_MESSAGE,
  });
  await assert.rejects(store.remove("https://x"), { message: MISSING_PHOTO_TOKEN_MESSAGE });
});
