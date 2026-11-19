// Animal photos, against a real Postgres: added (the file put first, then the
// row and its activity line), replaced (the new file put first, then the row's
// URL swapped and logged, then the old file removed) and deleted (the row and
// its activity line, then the file on the row) through the photo service, as
// the upload and replace routes and the delete action drive it, with the
// in-memory store standing in for Blob.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { AnimalActivityType, IntakeType, Sex } from "@/prisma/generated/enums";
import {
  ANIMAL_NOT_FOUND_MESSAGE,
  PHOTO_CHANGED_MESSAGE,
  PHOTO_NOT_FOUND_MESSAGE,
  addAnimalPhoto,
  deleteAnimalPhoto,
  replaceAnimalPhoto,
} from "@/app/lib/services/animal-photos";
import { memoryPhotoStore, type MemoryPhotoStore } from "@/app/lib/storage/animal-photo-store";
import { MAX_PHOTO_BYTES, PHOTO_TOO_LARGE_MESSAGE } from "@/app/lib/storage/photo-size";
import { HEIC_PHOTO_MESSAGE, NOT_A_PHOTO_MESSAGE } from "@/app/lib/storage/photo-type";

// Random, not the time: the files run in parallel, and each cleans up what
// carries its own runId.
const runId = randomUUID().slice(0, 8);

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = new TextEncoder().encode("%PDF-1.4\n% not a photo\n");
const TEXT = new TextEncoder().encode("Rex, brown, friendly. Saved as rex.jpg\n");
const HEIC = Uint8Array.from([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);

let speciesId: string;
let colorId: string;
let staffId: string;

const name = (label: string) => `${label} ${runId}`;

before(async () => {
  speciesId = (
    await prisma.species.create({ data: { name: name("Photo species") }, select: { id: true } })
  ).id;
  colorId = (
    await prisma.color.create({ data: { name: name("Photo color") }, select: { id: true } })
  ).id;
  staffId = (await prisma.person.create({ data: { name: name("Olivia") }, select: { id: true } })).id;
});

after(async () => {
  await prisma.intake.deleteMany({ where: { staffMemberId: staffId } });
  // Takes the photos and activity rows with it.
  await prisma.animal.deleteMany({ where: { speciesId } });
  await prisma.person.deleteMany({ where: { id: staffId } });
  await prisma.color.deleteMany({ where: { id: colorId } });
  await prisma.species.deleteMany({ where: { id: speciesId } });
  await prisma.$disconnect();
});

const makeAnimal = async (label: string) =>
  (
    await prisma.animal.create({
      data: {
        name: name(label),
        birthDate: "2024-01-01",
        sex: Sex.FEMALE,
        speciesId,
        primaryColorId: colorId,
        intake: {
          create: { type: IntakeType.STRAY, intakeDate: "2026-08-01", staffMemberId: staffId },
        },
      },
      select: { id: true },
    })
  ).id;

const photosOf = (animalId: string) =>
  prisma.animalImage.findMany({
    where: { animalId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, url: true, sortOrder: true },
  });

const feedOf = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: {
      animalId,
      activityType: {
        in: [
          AnimalActivityType.PHOTO_UPLOADED,
          AnimalActivityType.PHOTO_DELETED,
          AnimalActivityType.PHOTO_REPLACED,
        ],
      },
    },
    orderBy: { changedAt: "asc" },
    select: { activityType: true, changedById: true, changeSummary: true },
  });

test("adding a photo puts its file, adds it last in the order and logs it", async () => {
  const animalId = await makeAnimal("Rex");
  const store = memoryPhotoStore();
  await prisma.animalImage.create({
    data: { animalId, url: "/seed-images/dogs/rex.webp", sortOrder: 4 },
  });

  const result = await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: JPEG });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.url, /^memory:\/\/animal-photos\/[0-9a-f-]{36}\.jpg$/);
  assert.deepEqual(store.urls(), [result.url]);
  assert.deepEqual(store.read(result.url), { bytes: JPEG, contentType: "image/jpeg" });
  assert.deepEqual(
    (await photosOf(animalId)).map(({ url, sortOrder }) => ({ url, sortOrder })),
    [
      { url: "/seed-images/dogs/rex.webp", sortOrder: 4 },
      { url: result.url, sortOrder: 5 },
    ],
  );
  assert.equal((await photosOf(animalId))[1].id, result.imageId);
  assert.deepEqual(await feedOf(animalId), [
    {
      activityType: AnimalActivityType.PHOTO_UPLOADED,
      changedById: staffId,
      changeSummary: `A new photo was uploaded. URL: ${result.url}`,
    },
  ]);
});

test("an animal's first photo takes the first place", async () => {
  const animalId = await makeAnimal("Bella");
  const store = memoryPhotoStore();

  const result = await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: PNG });

  assert.equal(result.ok, true);
  assert.deepEqual(
    (await photosOf(animalId)).map(({ sortOrder }) => sortOrder),
    [0],
  );
  assert.match(store.urls()[0], /\.png$/);
});

test("a file that isn't a JPEG, PNG or WebP is refused, and nothing is put or written", async () => {
  const animalId = await makeAnimal("Milo");
  const store = memoryPhotoStore();

  for (const [bytes, message] of [
    [PDF, NOT_A_PHOTO_MESSAGE],
    [TEXT, NOT_A_PHOTO_MESSAGE],
    [new Uint8Array(), NOT_A_PHOTO_MESSAGE],
    [HEIC, HEIC_PHOTO_MESSAGE],
  ] as const) {
    assert.deepEqual(
      await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes }),
      { ok: false, status: 400, message },
    );
  }
  assert.deepEqual(store.urls(), []);
  assert.deepEqual(await photosOf(animalId), []);
  assert.deepEqual(await feedOf(animalId), []);
});

test("a photo over the size limit is refused, and nothing is put or written", async () => {
  const animalId = await makeAnimal("Luna");
  const store = memoryPhotoStore();
  const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
  big.set(JPEG);

  assert.deepEqual(
    await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: big }),
    { ok: false, status: 413, message: PHOTO_TOO_LARGE_MESSAGE },
  );
  assert.deepEqual(store.urls(), []);
  assert.deepEqual(await photosOf(animalId), []);
});

test("a photo for an unknown animal is refused, and nothing is put", async () => {
  const store = memoryPhotoStore();

  assert.deepEqual(
    await addAnimalPhoto(prisma, store, {
      animalId: "cl0000000000000000000none",
      staffMemberId: staffId,
      bytes: JPEG,
    }),
    { ok: false, status: 404, message: ANIMAL_NOT_FOUND_MESSAGE },
  );
  assert.deepEqual(store.urls(), []);
});

test("when the row can't be written, the file put for it is removed again", async () => {
  const animalId = await makeAnimal("Oscar");
  const store = memoryPhotoStore();

  // No such person: the activity line's foreign key fails the transaction.
  await assert.rejects(
    addAnimalPhoto(prisma, store, {
      animalId,
      staffMemberId: "cl0000000000000000000none",
      bytes: JPEG,
    }),
  );
  assert.deepEqual(store.urls(), []);
  assert.equal(store.removeCalls().length, 1);
  assert.deepEqual(await photosOf(animalId), []);
  assert.deepEqual(await feedOf(animalId), []);
});

/** The client, but its transaction commits and then throws, as when the
 * connection drops before the commit's answer arrives. */
const commitAnswerLost = new Proxy(prisma, {
  get(target, property, receiver) {
    if (property === "$transaction") {
      return async (run: Parameters<typeof prisma.$transaction>[0]) => {
        await target.$transaction(run);
        throw new Error("Connection lost before the commit's answer.");
      };
    }
    return Reflect.get(target, property, receiver);
  },
}) as typeof prisma;

test("when the commit lands but its answer is lost, the photo is kept and reported added", async () => {
  const animalId = await makeAnimal("Bailey");
  const store = memoryPhotoStore();

  const result = await addAnimalPhoto(commitAnswerLost, store, {
    animalId,
    staffMemberId: staffId,
    bytes: JPEG,
  });

  const photos = await photosOf(animalId);
  assert.equal(photos.length, 1);
  assert.deepEqual(result, { ok: true, imageId: photos[0].id, url: photos[0].url });
  assert.deepEqual(store.urls(), [photos[0].url]);
  assert.deepEqual(store.removeCalls(), []);
});

test("when the row can't be checked after a failure, the file is kept", async () => {
  const animalId = await makeAnimal("Willow");
  const store = memoryPhotoStore();
  const unreachable = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async () => {
          throw new Error("Connection lost.");
        };
      }
      if (property === "animalImage") {
        return {
          findFirst: async () => {
            throw new Error("Still no connection.");
          },
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as typeof prisma;

  await assert.rejects(
    addAnimalPhoto(unreachable, store, { animalId, staffMemberId: staffId, bytes: JPEG }),
    /Connection lost\./,
  );
  assert.equal(store.urls().length, 1);
  assert.deepEqual(store.removeCalls(), []);
});

test("when the store refuses the file, no row is written", async () => {
  const animalId = await makeAnimal("Daisy");
  const store = memoryPhotoStore();
  store.failNextPut();

  await assert.rejects(
    addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: JPEG }),
    /refused/,
  );
  assert.deepEqual(await photosOf(animalId), []);
  assert.deepEqual(await feedOf(animalId), []);
});

test("deleting a photo removes the row, logs it, then removes the row's file", async () => {
  const animalId = await makeAnimal("Cooper");
  const store = memoryPhotoStore();
  const added = await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: JPEG });
  const kept = await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: PNG });
  assert.ok(added.ok && kept.ok);

  const result = await deleteAnimalPhoto(prisma, store, {
    animalId,
    imageId: added.imageId,
    staffMemberId: staffId,
  });

  assert.deepEqual(result, { ok: true, url: added.url });
  assert.deepEqual(
    (await photosOf(animalId)).map(({ id }) => id),
    [kept.imageId],
  );
  assert.deepEqual(store.urls(), [kept.url]);
  assert.deepEqual(store.removeCalls(), [added.url]);
  assert.deepEqual((await feedOf(animalId)).at(-1), {
    activityType: AnimalActivityType.PHOTO_DELETED,
    changedById: staffId,
    changeSummary: `A photo was deleted. URL: ${added.url}`,
  });
});

test("another animal's photo is refused, and nothing changes", async () => {
  const animalId = await makeAnimal("Max");
  const otherId = await makeAnimal("Ruby");
  const store = memoryPhotoStore();
  const other = await addAnimalPhoto(prisma, store, {
    animalId: otherId,
    staffMemberId: staffId,
    bytes: JPEG,
  });
  assert.ok(other.ok);

  assert.deepEqual(
    await deleteAnimalPhoto(prisma, store, { animalId, imageId: other.imageId, staffMemberId: staffId }),
    { ok: false, status: 404, message: PHOTO_NOT_FOUND_MESSAGE },
  );
  assert.deepEqual(
    (await photosOf(otherId)).map(({ id }) => id),
    [other.imageId],
  );
  assert.deepEqual(store.urls(), [other.url]);
  assert.deepEqual(store.removeCalls(), []);
  assert.deepEqual(await feedOf(animalId), []);
  assert.equal((await feedOf(otherId)).length, 1);
});

test("a photo already deleted is refused, and nothing is logged twice", async () => {
  const animalId = await makeAnimal("Rocky");
  const store = memoryPhotoStore();
  const added = await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: JPEG });
  assert.ok(added.ok);
  const input = { animalId, imageId: added.imageId, staffMemberId: staffId };

  assert.equal((await deleteAnimalPhoto(prisma, store, input)).ok, true);
  assert.deepEqual(await deleteAnimalPhoto(prisma, store, input), {
    ok: false,
    status: 404,
    message: PHOTO_NOT_FOUND_MESSAGE,
  });
  assert.deepEqual(
    (await feedOf(animalId)).map(({ activityType }) => activityType),
    [AnimalActivityType.PHOTO_UPLOADED, AnimalActivityType.PHOTO_DELETED],
  );
});

test("deleting a seed photo removes the row and leaves the file alone", async () => {
  const animalId = await makeAnimal("Sadie");
  const store = memoryPhotoStore();
  const seedUrl = "/seed-images/dogs/sadie.webp";
  const { id: imageId } = await prisma.animalImage.create({
    data: { animalId, url: seedUrl, sortOrder: 0 },
    select: { id: true },
  });

  assert.deepEqual(
    await deleteAnimalPhoto(prisma, store, { animalId, imageId, staffMemberId: staffId }),
    { ok: true, url: seedUrl },
  );
  assert.deepEqual(await photosOf(animalId), []);
  // Handed to the store, which ignores a URL it didn't write.
  assert.deepEqual(store.removeCalls(), [seedUrl]);
  assert.deepEqual(store.urls(), []);
});

test("a file that can't be removed leaves the photo deleted", async () => {
  const animalId = await makeAnimal("Toby");
  const store = memoryPhotoStore();
  const added = await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: JPEG });
  assert.ok(added.ok);
  store.failNextRemove();

  const result = await deleteAnimalPhoto(prisma, store, {
    animalId,
    imageId: added.imageId,
    staffMemberId: staffId,
  });

  assert.deepEqual(result, { ok: true, url: added.url });
  assert.deepEqual(await photosOf(animalId), []);
  // A stray file, never a photo on the page without its file.
  assert.deepEqual(store.urls(), [added.url]);
});

// ---------------------------------------------------------------------------
// Replacing
// ---------------------------------------------------------------------------

const WEBP = Uint8Array.from([
  ...new TextEncoder().encode("RIFF"),
  0x24, 0, 0, 0,
  ...new TextEncoder().encode("WEBPVP8 "),
]);

/** An animal with two photos added through the service: the primary, then a
 * second one. */
const animalWithTwoPhotos = async (label: string, store: MemoryPhotoStore) => {
  const animalId = await makeAnimal(label);
  const primary = await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: JPEG });
  const second = await addAnimalPhoto(prisma, store, { animalId, staffMemberId: staffId, bytes: PNG });
  assert.ok(primary.ok && second.ok);
  return { animalId, primary, second };
};

/** `store`, but once it has put a file, `meanwhile` runs: what another tab
 * does between the service's first read and its update. */
const storeWhere = (store: MemoryPhotoStore, meanwhile: () => Promise<unknown>): MemoryPhotoStore => ({
  ...store,
  async put(name, bytes, contentType) {
    const url = await store.put(name, bytes, contentType);
    await meanwhile();
    return url;
  },
});

const replacedLines = async (animalId: string) =>
  (await feedOf(animalId)).filter(({ activityType }) => activityType === AnimalActivityType.PHOTO_REPLACED);

test("replacing a photo swaps its file in the same row and place, logs it, then removes the old file", async () => {
  const store = memoryPhotoStore();
  const { animalId, primary, second } = await animalWithTwoPhotos("Benji", store);
  const before = await photosOf(animalId);

  const result = await replaceAnimalPhoto(prisma, store, {
    animalId,
    imageId: primary.imageId,
    expectedUrl: primary.url,
    staffMemberId: staffId,
    bytes: WEBP,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.url, /^memory:\/\/animal-photos\/[0-9a-f-]{36}\.webp$/);
  assert.deepEqual(result, { ok: true, imageId: primary.imageId, url: result.url, replacedUrl: primary.url });
  // Same rows, same order: the replaced photo is still the primary one.
  assert.deepEqual(await photosOf(animalId), [{ ...before[0], url: result.url }, before[1]]);
  assert.deepEqual(store.read(result.url), { bytes: WEBP, contentType: "image/webp" });
  assert.deepEqual(store.urls().sort(), [second.url, result.url].sort());
  assert.deepEqual(store.removeCalls(), [primary.url]);
  assert.deepEqual(await replacedLines(animalId), [
    {
      activityType: AnimalActivityType.PHOTO_REPLACED,
      changedById: staffId,
      changeSummary: `A photo was replaced. Old URL: ${primary.url} New URL: ${result.url}`,
    },
  ]);
});

test("replacing another animal's photo is refused, and nothing is put or changed", async () => {
  const store = memoryPhotoStore();
  const animalId = await makeAnimal("Archie");
  const { animalId: otherId, primary } = await animalWithTwoPhotos("Nala", store);
  const otherBefore = await photosOf(otherId);
  const urlsBefore = store.urls();

  assert.deepEqual(
    await replaceAnimalPhoto(prisma, store, {
      animalId,
      imageId: primary.imageId,
      expectedUrl: primary.url,
      staffMemberId: staffId,
      bytes: WEBP,
    }),
    { ok: false, status: 404, message: PHOTO_NOT_FOUND_MESSAGE },
  );
  assert.deepEqual(await photosOf(otherId), otherBefore);
  assert.deepEqual(store.urls(), urlsBefore);
  assert.deepEqual(store.removeCalls(), []);
  assert.deepEqual(await feedOf(animalId), []);
  assert.equal((await feedOf(otherId)).length, 2);
});

test("a photo deleted or replaced since the page was opened is refused before anything is put", async () => {
  const store = memoryPhotoStore();
  const { animalId, primary, second } = await animalWithTwoPhotos("Zeus", store);
  // Another tab replaced the primary photo and deleted the second one.
  const elsewhere = await replaceAnimalPhoto(prisma, store, {
    animalId,
    imageId: primary.imageId,
    expectedUrl: primary.url,
    staffMemberId: staffId,
    bytes: PNG,
  });
  assert.ok(elsewhere.ok);
  assert.ok(
    (await deleteAnimalPhoto(prisma, store, { animalId, imageId: second.imageId, staffMemberId: staffId })).ok,
  );
  const photosBefore = await photosOf(animalId);
  const urlsBefore = store.urls();
  const feedBefore = await feedOf(animalId);

  assert.deepEqual(
    await replaceAnimalPhoto(prisma, store, {
      animalId,
      imageId: primary.imageId,
      expectedUrl: primary.url,
      staffMemberId: staffId,
      bytes: WEBP,
    }),
    { ok: false, status: 409, message: PHOTO_CHANGED_MESSAGE },
  );
  assert.deepEqual(
    await replaceAnimalPhoto(prisma, store, {
      animalId,
      imageId: second.imageId,
      expectedUrl: second.url,
      staffMemberId: staffId,
      bytes: WEBP,
    }),
    { ok: false, status: 404, message: PHOTO_NOT_FOUND_MESSAGE },
  );
  assert.deepEqual(await photosOf(animalId), photosBefore);
  assert.deepEqual(store.urls(), urlsBefore);
  assert.deepEqual(await feedOf(animalId), feedBefore);
});

test("a photo replaced while the new one uploads is refused, and the new file is removed again", async () => {
  const base = memoryPhotoStore();
  const { animalId, primary } = await animalWithTwoPhotos("Coco", base);
  const otherTabUrl = "memory://animal-photos/00000000-0000-4000-8000-000000000000.jpg";
  const store = storeWhere(base, () =>
    prisma.animalImage.update({ where: { id: primary.imageId }, data: { url: otherTabUrl } }),
  );
  const feedBefore = await feedOf(animalId);

  assert.deepEqual(
    await replaceAnimalPhoto(prisma, store, {
      animalId,
      imageId: primary.imageId,
      expectedUrl: primary.url,
      staffMemberId: staffId,
      bytes: WEBP,
    }),
    { ok: false, status: 409, message: PHOTO_CHANGED_MESSAGE },
  );
  // The other tab's photo stays; this one's file was put and removed again.
  assert.equal((await photosOf(animalId))[0].url, otherTabUrl);
  const removed = base.removeCalls();
  assert.equal(removed.length, 1);
  assert.match(removed[0], /\.webp$/);
  assert.equal(base.read(removed[0]), undefined);
  assert.ok(base.read(primary.url), "the old file is the other tab's to remove");
  assert.deepEqual(await feedOf(animalId), feedBefore);
});

test("a photo deleted while the new one uploads is refused, and the new file is removed again", async () => {
  const base = memoryPhotoStore();
  const { animalId, primary, second } = await animalWithTwoPhotos("Pepper", base);
  const store = storeWhere(base, () => prisma.animalImage.delete({ where: { id: primary.imageId } }));

  assert.deepEqual(
    await replaceAnimalPhoto(prisma, store, {
      animalId,
      imageId: primary.imageId,
      expectedUrl: primary.url,
      staffMemberId: staffId,
      bytes: WEBP,
    }),
    { ok: false, status: 404, message: PHOTO_NOT_FOUND_MESSAGE },
  );
  assert.deepEqual(
    (await photosOf(animalId)).map(({ id }) => id),
    [second.imageId],
  );
  assert.deepEqual(base.urls().sort(), [primary.url, second.url].sort());
  assert.equal(base.removeCalls().length, 1);
  assert.deepEqual(await replacedLines(animalId), []);
});

test("replacing a seed photo leaves its file alone", async () => {
  const animalId = await makeAnimal("Rosie");
  const store = memoryPhotoStore();
  const seedUrl = "/seed-images/dogs/rosie.webp";
  const { id: imageId } = await prisma.animalImage.create({
    data: { animalId, url: seedUrl, sortOrder: 0 },
    select: { id: true },
  });

  const result = await replaceAnimalPhoto(prisma, store, {
    animalId,
    imageId,
    expectedUrl: seedUrl,
    staffMemberId: staffId,
    bytes: JPEG,
  });

  assert.ok(result.ok);
  assert.deepEqual(await photosOf(animalId), [{ id: imageId, url: result.url, sortOrder: 0 }]);
  // Handed to the store, which ignores a URL it didn't write.
  assert.deepEqual(store.removeCalls(), [seedUrl]);
  assert.deepEqual(store.urls(), [result.url]);
});

test("when the swap can't be written, the new file is removed and the photo is unchanged", async () => {
  const store = memoryPhotoStore();
  const { animalId, primary } = await animalWithTwoPhotos("Teddy", store);
  const photosBefore = await photosOf(animalId);
  const urlsBefore = store.urls();
  const feedBefore = await feedOf(animalId);

  // No such person: the activity line's foreign key fails the transaction.
  await assert.rejects(
    replaceAnimalPhoto(prisma, store, {
      animalId,
      imageId: primary.imageId,
      expectedUrl: primary.url,
      staffMemberId: "cl0000000000000000000none",
      bytes: WEBP,
    }),
  );
  assert.deepEqual(await photosOf(animalId), photosBefore);
  assert.deepEqual(store.urls(), urlsBefore);
  assert.equal(store.removeCalls().length, 1);
  assert.match(store.removeCalls()[0], /\.webp$/);
  assert.deepEqual(await feedOf(animalId), feedBefore);
});

test("when the swap commits but its answer is lost, the photo is reported replaced", async () => {
  const store = memoryPhotoStore();
  const { animalId, primary } = await animalWithTwoPhotos("Hazel", store);

  const result = await replaceAnimalPhoto(commitAnswerLost, store, {
    animalId,
    imageId: primary.imageId,
    expectedUrl: primary.url,
    staffMemberId: staffId,
    bytes: WEBP,
  });

  const photos = await photosOf(animalId);
  assert.deepEqual(result, { ok: true, imageId: primary.imageId, url: photos[0].url, replacedUrl: primary.url });
  assert.ok(store.read(photos[0].url));
  assert.deepEqual(store.removeCalls(), [primary.url]);
  assert.equal((await replacedLines(animalId)).length, 1);
});

test("an old file that can't be removed leaves the photo replaced", async () => {
  const store = memoryPhotoStore();
  const { animalId, primary } = await animalWithTwoPhotos("Loki", store);
  store.failNextRemove();

  const result = await replaceAnimalPhoto(prisma, store, {
    animalId,
    imageId: primary.imageId,
    expectedUrl: primary.url,
    staffMemberId: staffId,
    bytes: WEBP,
  });

  assert.ok(result.ok);
  assert.equal((await photosOf(animalId))[0].url, result.url);
  // A stray file, never a photo on the page without its file.
  assert.ok(store.read(primary.url));
  assert.ok(store.read(result.url));
});

test("a replacement that isn't a photo, or is too big, is refused before anything is put", async () => {
  const store = memoryPhotoStore();
  const { animalId, primary } = await animalWithTwoPhotos("Juno", store);
  const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
  big.set(JPEG);
  const urlsBefore = store.urls();
  const photosBefore = await photosOf(animalId);

  for (const [bytes, refusal] of [
    [PDF, { ok: false, status: 400, message: NOT_A_PHOTO_MESSAGE }],
    [HEIC, { ok: false, status: 400, message: HEIC_PHOTO_MESSAGE }],
    [big, { ok: false, status: 413, message: PHOTO_TOO_LARGE_MESSAGE }],
  ] as const) {
    assert.deepEqual(
      await replaceAnimalPhoto(prisma, store, {
        animalId,
        imageId: primary.imageId,
        expectedUrl: primary.url,
        staffMemberId: staffId,
        bytes,
      }),
      refusal,
    );
  }
  assert.deepEqual(store.urls(), urlsBefore);
  assert.deepEqual(await photosOf(animalId), photosBefore);
  assert.deepEqual(await replacedLines(animalId), []);
});

test("a photo replaced while it is being deleted is refused, and the new photo keeps its file", async () => {
  const store = memoryPhotoStore();
  const { animalId, primary } = await animalWithTwoPhotos("Mochi", store);
  // Another tab replaces the photo between the delete's read of the row and
  // its delete: the delete's first read runs it, on another connection.
  let otherTab: Awaited<ReturnType<typeof replaceAnimalPhoto>> | null = null;
  const replacedMidway = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return (run: (tx: typeof prisma) => Promise<unknown>) =>
        target.$transaction((tx) => {
          const images = new Proxy(tx.animalImage, {
            get(delegate, name, delegateReceiver) {
              if (name !== "findFirst") return Reflect.get(delegate, name, delegateReceiver);
              return async (args: Parameters<typeof tx.animalImage.findFirst>[0]) => {
                const found = await delegate.findFirst(args);
                otherTab ??= await replaceAnimalPhoto(prisma, store, {
                  animalId,
                  imageId: primary.imageId,
                  expectedUrl: primary.url,
                  staffMemberId: staffId,
                  bytes: WEBP,
                });
                return found;
              };
            },
          });
          const txWithReplace = new Proxy(tx, {
            get: (client, name, clientReceiver) =>
              name === "animalImage" ? images : Reflect.get(client, name, clientReceiver),
          });
          return run(txWithReplace as unknown as typeof prisma);
        });
    },
  }) as typeof prisma;

  assert.deepEqual(
    await deleteAnimalPhoto(replacedMidway, store, { animalId, imageId: primary.imageId, staffMemberId: staffId }),
    { ok: false, status: 409, message: PHOTO_CHANGED_MESSAGE },
  );
  const replaced = otherTab as Awaited<ReturnType<typeof replaceAnimalPhoto>> | null;
  assert.ok(replaced?.ok);
  // The other tab's photo is still there with its file; only the file it
  // replaced was removed, and no delete was logged.
  assert.equal((await photosOf(animalId))[0].url, replaced.url);
  assert.ok(store.read(replaced.url));
  assert.deepEqual(store.removeCalls(), [primary.url]);
  assert.deepEqual(
    (await feedOf(animalId)).map(({ activityType }) => activityType),
    [AnimalActivityType.PHOTO_UPLOADED, AnimalActivityType.PHOTO_UPLOADED, AnimalActivityType.PHOTO_REPLACED],
  );
});
