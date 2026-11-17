// Animal photos, against a real Postgres: added (the file put first, then the
// row and its activity line) and deleted (the row and its activity line, then
// the file on the row) through the photo service, as the upload route and the
// delete action drive it, with the in-memory store standing in for Blob.
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { AnimalActivityType, IntakeType, Sex } from "@/prisma/generated/enums";
import {
  ANIMAL_NOT_FOUND_MESSAGE,
  PHOTO_NOT_FOUND_MESSAGE,
  addAnimalPhoto,
  deleteAnimalPhoto,
} from "@/app/lib/services/animal-photos";
import { memoryPhotoStore } from "@/app/lib/storage/animal-photo-store";
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
      activityType: { in: [AnimalActivityType.PHOTO_UPLOADED, AnimalActivityType.PHOTO_DELETED] },
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
