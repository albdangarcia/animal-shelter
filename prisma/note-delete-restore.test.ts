// Lives under prisma/ so `npm run test:db` runs it against its throwaway
// docker-compose Postgres (see scripts/test-db.ts), never the dev DB.
//
// This binds to the service the three delete/restore action pairs share. The
// actions cannot be driven from a node:test process (they call
// `revalidatePath`), so the rules are asserted here: which notes a request can
// reach, what a refusal leaves behind (nothing), and which rows a success
// writes. The actions only validate ids, run the service in a transaction and
// turn a refusal into `{ ok: false, message }`.
//
// No mocking: real rows, the service called inside real `prisma.$transaction`s,
// assertions on the rows.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "@/app/lib/prisma";
import type { TransactionClient } from "@/app/lib/prisma";
import {
  noteRefusalMessage,
  restoreAnimalNoteRow,
  restorePartnerNoteRow,
  restorePersonNoteRow,
  softDeleteAnimalNote,
  softDeletePartnerNote,
  softDeletePersonNote,
} from "@/app/lib/services/note-delete-restore";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import {
  AnimalActivityType,
  NoteCategory,
  NoteEventAction,
  NoteTargetType,
  PartnerType,
  Sex,
} from "@/prisma/generated/enums";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createFixture>>;

/**
 * One self-contained graph per test: an actor, and for each kind of note two
 * owners (so "the note belongs to another owner" has somewhere to point), with
 * one live note on the first of each.
 */
async function createFixture() {
  const tag = randomUUID().slice(0, 8);

  const actor = await prisma.person.create({
    data: { name: `Note Actor ${tag}` },
    select: { id: true },
  });
  const otherPerson = await prisma.person.create({
    data: { name: `Note Other Person ${tag}` },
    select: { id: true },
  });
  const species = await prisma.species.create({
    data: { name: `Note Species ${tag}` },
    select: { id: true },
  });
  const color = await prisma.color.create({
    data: { name: `Note Color ${tag}` },
    select: { id: true },
  });
  const makeAnimal = (label: string) =>
    prisma.animal.create({
      data: {
        name: `Note ${label} Animal ${tag}`,
        birthDate: "2020-01-01",
        sex: Sex.UNKNOWN,
        speciesId: species.id,
        primaryColorId: color.id,
      },
      select: { id: true },
    });
  const animal = await makeAnimal("First");
  const otherAnimal = await makeAnimal("Second");
  const makePartner = (label: string) =>
    prisma.partner.create({
      data: { name: `Note ${label} Partner ${tag}`, type: PartnerType.SHELTER },
      select: { id: true },
    });
  const partner = await makePartner("First");
  const otherPartner = await makePartner("Second");

  const animalNote = await prisma.animalNote.create({
    data: {
      animalId: animal.id,
      authorId: actor.id,
      category: NoteCategory.BEHAVIORAL,
      content: "animal note",
    },
    select: { id: true },
  });
  const personNote = await prisma.personNote.create({
    data: { personId: actor.id, authorId: actor.id, content: "person note" },
    select: { id: true },
  });
  const partnerNote = await prisma.partnerNote.create({
    data: { partnerId: partner.id, authorId: actor.id, content: "partner note" },
    select: { id: true },
  });

  return {
    actorId: actor.id,
    otherPersonId: otherPerson.id,
    speciesId: species.id,
    colorId: color.id,
    animalIds: [animal.id, otherAnimal.id],
    partnerIds: [partner.id, otherPartner.id],
    animal: { ownerId: animal.id, otherOwnerId: otherAnimal.id, noteId: animalNote.id },
    person: { ownerId: actor.id, otherOwnerId: otherPerson.id, noteId: personNote.id },
    partner: { ownerId: partner.id, otherOwnerId: otherPartner.id, noteId: partnerNote.id },
  };
}

async function destroyFixture(f: Fixture) {
  const personIds = [f.actorId, f.otherPersonId];
  const noteIds = [f.animal.noteId, f.person.noteId, f.partner.noteId];
  // NoteEvent.actorId and AnimalActivityLog.changedById are RESTRICT FKs to
  // Person, so those rows go before the actor.
  await prisma.noteEvent.deleteMany({ where: { targetId: { in: noteIds } } });
  await prisma.animalActivityLog.deleteMany({
    where: { animalId: { in: f.animalIds } },
  });
  await prisma.animalNote.deleteMany({ where: { animalId: { in: f.animalIds } } });
  await prisma.personNote.deleteMany({ where: { personId: { in: personIds } } });
  await prisma.partnerNote.deleteMany({
    where: { partnerId: { in: f.partnerIds } },
  });
  await prisma.animal.deleteMany({ where: { id: { in: f.animalIds } } });
  await prisma.partner.deleteMany({ where: { id: { in: f.partnerIds } } });
  await prisma.species.delete({ where: { id: f.speciesId } });
  await prisma.color.delete({ where: { id: f.colorId } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
}

type ServiceFn = (
  tx: TransactionClient,
  noteId: string,
  ownerId: string,
  actorPersonId: string,
) => Promise<void>;

interface Kind {
  name: "animal" | "person" | "partner";
  targetType: NoteTargetType;
  softDelete: ServiceFn;
  restore: ServiceFn;
  /** The note's state, whatever table it lives in. */
  readNote: (id: string) => Promise<{
    deletedAt: Date | null;
    lastEditedById: string | null;
    lastEditedAt: Date | null;
  }>;
  /** The owner's id, and the id of another owner of the same kind. */
  pick: (f: Fixture) => { ownerId: string; otherOwnerId: string; noteId: string };
  activityTypes: { deleted: AnimalActivityType; restored: AnimalActivityType } | null;
}

const kinds: Kind[] = [
  {
    name: "animal",
    targetType: NoteTargetType.ANIMAL,
    softDelete: softDeleteAnimalNote,
    restore: restoreAnimalNoteRow,
    readNote: (id) =>
      prisma.animalNote.findUniqueOrThrow({
        where: { id },
        select: { deletedAt: true, lastEditedById: true, lastEditedAt: true },
      }),
    pick: (f) => f.animal,
    activityTypes: {
      deleted: AnimalActivityType.NOTE_DELETED,
      restored: AnimalActivityType.NOTE_RESTORED,
    },
  },
  {
    name: "person",
    targetType: NoteTargetType.PERSON,
    softDelete: softDeletePersonNote,
    restore: restorePersonNoteRow,
    readNote: (id) =>
      prisma.personNote.findUniqueOrThrow({
        where: { id },
        select: { deletedAt: true, lastEditedById: true, lastEditedAt: true },
      }),
    pick: (f) => f.person,
    activityTypes: null,
  },
  {
    name: "partner",
    targetType: NoteTargetType.PARTNER,
    softDelete: softDeletePartnerNote,
    restore: restorePartnerNoteRow,
    readNote: (id) =>
      prisma.partnerNote.findUniqueOrThrow({
        where: { id },
        select: { deletedAt: true, lastEditedById: true, lastEditedAt: true },
      }),
    pick: (f) => f.partner,
    activityTypes: null,
  },
];

const eventsFor = (noteId: string) =>
  prisma.noteEvent.findMany({
    where: { targetId: noteId },
    orderBy: { createdAt: "asc" },
  });

const activityFor = (animalId: string) =>
  prisma.animalActivityLog.findMany({
    where: { animalId },
    orderBy: { changedAt: "asc" },
  });

/** Run `fn` in a transaction and return the error it ends in (or fail). */
const refusal = async (fn: (tx: TransactionClient) => Promise<void>) => {
  try {
    await prisma.$transaction(fn);
  } catch (error) {
    return error;
  }
  assert.fail("expected the transaction to be refused");
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run two changes to one note so that the second reads the note while the
 * first has written but not committed. The first transaction writes and then
 * holds its row lock until the second is seen waiting on that lock, so the
 * second always passes its own state check and only the `updateMany` guard can
 * refuse it. (Two plain concurrent transactions only sometimes interleave
 * like that.)
 */
const raceWhileLocked = async (
  first: (tx: TransactionClient) => Promise<void>,
  second: (tx: TransactionClient) => Promise<void>,
) => {
  let release!: () => void;
  let written!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const firstWritten = new Promise<void>((resolve) => (written = resolve));

  const firstRun = prisma.$transaction(
    async (tx) => {
      await first(tx);
      written();
      await gate;
    },
    { timeout: 30_000 },
  );
  await firstWritten;
  const secondRun = prisma.$transaction(second, { timeout: 30_000 });

  try {
    for (let waited = 0; ; waited += 50) {
      const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (n > 0) break;
      assert.ok(waited < 10_000, "the second transaction never waited on the lock");
      await sleep(50);
    }
  } finally {
    release();
  }
  return Promise.allSettled([firstRun, secondRun]);
};

for (const kind of kinds) {
  test(`${kind.name}: delete soft-deletes the note and writes the audit row`, async () => {
    const f = await createFixture();
    try {
      const { ownerId, noteId } = kind.pick(f);
      await prisma.$transaction((tx) =>
        kind.softDelete(tx, noteId, ownerId, f.actorId),
      );

      const note = await kind.readNote(noteId);
      assert.ok(note.deletedAt, "deletedAt is set");
      assert.equal(note.lastEditedById, f.actorId);
      assert.ok(note.lastEditedAt);

      const events = await eventsFor(noteId);
      assert.equal(events.length, 1);
      assert.equal(events[0].action, NoteEventAction.DELETED);
      assert.equal(events[0].targetType, kind.targetType);
      assert.equal(events[0].actorId, f.actorId);

      if (kind.activityTypes) {
        const logs = await activityFor(ownerId);
        assert.equal(logs.length, 1);
        assert.equal(logs[0].activityType, kind.activityTypes.deleted);
        assert.equal(logs[0].changedById, f.actorId);
        assert.equal(logs[0].changeSummary, "Behavioral");
      }
    } finally {
      await destroyFixture(f);
    }
  });

  test(`${kind.name}: restore clears deletedAt and writes the audit row`, async () => {
    const f = await createFixture();
    try {
      const { ownerId, noteId } = kind.pick(f);
      await prisma.$transaction((tx) =>
        kind.softDelete(tx, noteId, ownerId, f.actorId),
      );
      await prisma.$transaction((tx) =>
        kind.restore(tx, noteId, ownerId, f.actorId),
      );

      const note = await kind.readNote(noteId);
      assert.equal(note.deletedAt, null);
      assert.equal(note.lastEditedById, f.actorId);

      const events = await eventsFor(noteId);
      assert.deepEqual(
        events.map((e) => e.action),
        [NoteEventAction.DELETED, NoteEventAction.RESTORED],
      );
      assert.equal(events[1].targetType, kind.targetType);
      assert.equal(events[1].actorId, f.actorId);

      if (kind.activityTypes) {
        const logs = await activityFor(ownerId);
        assert.deepEqual(
          logs.map((l) => l.activityType),
          [kind.activityTypes.deleted, kind.activityTypes.restored],
        );
        assert.equal(logs[1].changeSummary, "Behavioral");
      }
    } finally {
      await destroyFixture(f);
    }
  });

  test(`${kind.name}: a note that belongs to another owner is refused, for delete and for restore`, async () => {
    const f = await createFixture();
    try {
      const { otherOwnerId, ownerId, noteId } = kind.pick(f);

      // Delete with the wrong owner: refused, the note stays live.
      const deleteError = await refusal((tx) =>
        kind.softDelete(tx, noteId, otherOwnerId, f.actorId),
      );
      assert.ok(deleteError instanceof NotFoundError);
      assert.equal(noteRefusalMessage(deleteError), "Note not found.");
      assert.equal((await kind.readNote(noteId)).deletedAt, null);
      assert.equal((await kind.readNote(noteId)).lastEditedById, null);

      // Restore with the wrong owner: refused, the note stays deleted.
      await prisma.$transaction((tx) =>
        kind.softDelete(tx, noteId, ownerId, f.actorId),
      );
      const before = await kind.readNote(noteId);
      const restoreError = await refusal((tx) =>
        kind.restore(tx, noteId, otherOwnerId, f.actorId),
      );
      assert.ok(restoreError instanceof NotFoundError);
      assert.equal(noteRefusalMessage(restoreError), "Note not found.");
      assert.deepEqual(await kind.readNote(noteId), before);

      // Only the one legitimate delete left an audit row.
      assert.deepEqual(
        (await eventsFor(noteId)).map((e) => e.action),
        [NoteEventAction.DELETED],
      );
      if (kind.activityTypes) {
        assert.equal((await activityFor(otherOwnerId)).length, 0);
        assert.equal((await activityFor(ownerId)).length, 1);
      }
    } finally {
      await destroyFixture(f);
    }
  });

  test(`${kind.name}: a note id that does not exist is refused`, async () => {
    const f = await createFixture();
    try {
      const { ownerId } = kind.pick(f);
      const missing = randomUUID().replaceAll("-", "").slice(0, 25);

      for (const run of [kind.softDelete, kind.restore]) {
        const error = await refusal((tx) =>
          run(tx, missing, ownerId, f.actorId),
        );
        assert.ok(error instanceof NotFoundError);
        assert.equal(noteRefusalMessage(error), "Note not found.");
      }
      assert.equal((await eventsFor(missing)).length, 0);
    } finally {
      await destroyFixture(f);
    }
  });

  test(`${kind.name}: deleting a deleted note is refused and writes nothing`, async () => {
    const f = await createFixture();
    try {
      const { ownerId, noteId } = kind.pick(f);
      await prisma.$transaction((tx) =>
        kind.softDelete(tx, noteId, ownerId, f.actorId),
      );
      const before = await kind.readNote(noteId);

      const error = await refusal((tx) =>
        kind.softDelete(tx, noteId, ownerId, f.otherPersonId),
      );
      assert.ok(error instanceof ConflictError);
      assert.equal(noteRefusalMessage(error), "This note is already deleted.");

      // Not re-stamped with the second actor or a new time.
      assert.deepEqual(await kind.readNote(noteId), before);
      assert.equal((await eventsFor(noteId)).length, 1);
      if (kind.activityTypes) {
        assert.equal((await activityFor(ownerId)).length, 1);
      }
    } finally {
      await destroyFixture(f);
    }
  });

  test(`${kind.name}: restoring a live note is refused and writes nothing`, async () => {
    const f = await createFixture();
    try {
      const { ownerId, noteId } = kind.pick(f);
      const before = await kind.readNote(noteId);

      const error = await refusal((tx) =>
        kind.restore(tx, noteId, ownerId, f.actorId),
      );
      assert.ok(error instanceof ConflictError);
      assert.equal(
        noteRefusalMessage(error),
        "This note is not deleted, so there is nothing to restore.",
      );

      assert.deepEqual(await kind.readNote(noteId), before);
      assert.equal((await eventsFor(noteId)).length, 0);
      if (kind.activityTypes) {
        assert.equal((await activityFor(ownerId)).length, 0);
      }
    } finally {
      await destroyFixture(f);
    }
  });

  test(`${kind.name}: two deletes at once, one wins and one audit row is written`, async () => {
    const f = await createFixture();
    try {
      const { ownerId, noteId } = kind.pick(f);
      const [first, second] = await raceWhileLocked(
        (tx) => kind.softDelete(tx, noteId, ownerId, f.actorId),
        (tx) => kind.softDelete(tx, noteId, ownerId, f.actorId),
      );

      assert.equal(first.status, "fulfilled");
      assert.equal(second.status, "rejected");
      assert.ok(second.reason instanceof ConflictError);
      assert.equal(noteRefusalMessage(second.reason), "This note is already deleted.");
      assert.equal((await eventsFor(noteId)).length, 1);
      if (kind.activityTypes) {
        assert.equal((await activityFor(ownerId)).length, 1);
      }
    } finally {
      await destroyFixture(f);
    }
  });

  test(`${kind.name}: two restores at once, one wins and one audit row is written`, async () => {
    const f = await createFixture();
    try {
      const { ownerId, noteId } = kind.pick(f);
      await prisma.$transaction((tx) =>
        kind.softDelete(tx, noteId, ownerId, f.actorId),
      );
      const [first, second] = await raceWhileLocked(
        (tx) => kind.restore(tx, noteId, ownerId, f.actorId),
        (tx) => kind.restore(tx, noteId, ownerId, f.actorId),
      );

      assert.equal(first.status, "fulfilled");
      assert.equal(second.status, "rejected");
      assert.ok(second.reason instanceof ConflictError);
      assert.equal(
        noteRefusalMessage(second.reason),
        "This note is not deleted, so there is nothing to restore.",
      );
      assert.deepEqual(
        (await eventsFor(noteId)).map((e) => e.action),
        [NoteEventAction.DELETED, NoteEventAction.RESTORED],
      );
      if (kind.activityTypes) {
        assert.equal((await activityFor(ownerId)).length, 2);
      }
    } finally {
      await destroyFixture(f);
    }
  });

  test(`${kind.name}: a failure after the note is written rolls the whole change back`, async () => {
    const f = await createFixture();
    try {
      const { ownerId, noteId } = kind.pick(f);

      // The caller's transaction fails after the service has written: the note
      // row and its audit rows go together.
      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await kind.softDelete(tx, noteId, ownerId, f.actorId);
          throw new Error("later write failed");
        }),
        /later write failed/,
      );
      assert.equal((await kind.readNote(noteId)).deletedAt, null);
      assert.equal((await eventsFor(noteId)).length, 0);
      if (kind.activityTypes) {
        assert.equal((await activityFor(ownerId)).length, 0);
      }

      // A write the database itself rejects (an actor that is not a person)
      // is not a refusal: the service lets it through for the action to log.
      const dbError = await refusal((tx) =>
        kind.softDelete(tx, noteId, ownerId, "no-such-person"),
      );
      assert.equal(noteRefusalMessage(dbError), null);
      assert.equal((await kind.readNote(noteId)).deletedAt, null);
      assert.equal((await eventsFor(noteId)).length, 0);
      if (kind.activityTypes) {
        assert.equal((await activityFor(ownerId)).length, 0);
      }
    } finally {
      await destroyFixture(f);
    }
  });
}
