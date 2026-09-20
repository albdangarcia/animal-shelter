// Same reasoning as person-account-unlink.test.ts for living under prisma/ and
// running via `npm run test:db`. What is under test is what ends up in the
// rows: whether the column is set, whether the sessions are really gone, and
// whether a refused deactivation leaves no note behind — none of which is
// observable without the foreign keys and the conditional update actually
// running against Postgres.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  NoteEventAction,
  NoteTargetType,
  Role,
} from "@/prisma/generated/enums";
import {
  deactivateAccount,
  reactivateAccount,
} from "@/app/lib/services/user-deactivation";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";

const runId = Date.now().toString(36);
let counter = 0;

after(() => prisma.$disconnect());

/** A person with a login account. `role` defaults to a plain applicant. */
const makeAccount = async (label: string, role: Role = Role.USER) => {
  const n = ++counter;
  const person = await prisma.person.create({
    data: { name: `${label} ${runId}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      name: `${label} ${runId}`,
      email: `deactivation.${n}.${runId}@example.com`,
      emailVerified: true,
      role,
      personId: person.id,
    },
    select: { id: true },
  });
  return { userId: user.id, personId: person.id };
};

const cleanup = async (personIds: string[]) => {
  // Users first: Person.onDelete is Restrict. So is NoteEvent.actor, and the
  // actor is always in `personIds`. Sessions cascade with their user.
  await prisma.user.deleteMany({ where: { personId: { in: personIds } } });
  await prisma.noteEvent.deleteMany({ where: { actorId: { in: personIds } } });
  await prisma.personNote.deleteMany({ where: { personId: { in: personIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
};

const addSession = (userId: string, token: string) =>
  prisma.session.create({
    data: { userId, token, expiresAt: new Date(Date.now() + 60_000) },
  });

const notesOn = (personId: string) =>
  prisma.personNote.findMany({
    where: { personId },
    select: { id: true, content: true, authorId: true },
  });

test("deactivating ends the sessions and notes the record, with its event", async (t) => {
  const actor = await makeAccount("Deactivating Admin", Role.ADMIN);
  const target = await makeAccount("Barred Applicant");
  await addSession(target.userId, `tok-a-${runId}`);
  await addSession(target.userId, `tok-b-${runId}`);
  const bystander = await makeAccount("Bystander");
  await addSession(bystander.userId, `tok-c-${runId}`);

  try {
    const result = await prisma.$transaction((tx) =>
      deactivateAccount(tx, target.userId, actor, {
        reason: "Harassing applications",
      }),
    );
    assert.equal(result.personId, target.personId);

    await t.test("the column is set", async () => {
      const account = await prisma.user.findUniqueOrThrow({
        where: { id: target.userId },
        select: { deactivatedAt: true, personId: true },
      });
      assert.ok(account.deactivatedAt);
      assert.equal(account.personId, target.personId, "still linked");
    });

    await t.test("every session it held is gone, and nobody else's", async () => {
      assert.equal(
        await prisma.session.count({ where: { userId: target.userId } }),
        0,
      );
      assert.equal(
        await prisma.session.count({ where: { userId: bystander.userId } }),
        1,
      );
    });

    await t.test("the record carries a note with the reason, by the actor", async () => {
      const [note] = await notesOn(target.personId);
      assert.match(note.content, /deactivated/);
      assert.match(note.content, /Harassing applications/);
      assert.equal(note.authorId, actor.personId);
    });

    await t.test("the note has its NoteEvent", async () => {
      const [note] = await notesOn(target.personId);
      const events = await prisma.noteEvent.findMany({
        where: { targetId: note.id },
        select: { targetType: true, action: true, actorId: true },
      });
      assert.deepEqual(events, [
        {
          targetType: NoteTargetType.PERSON,
          action: NoteEventAction.CREATED,
          actorId: actor.personId,
        },
      ]);
    });
  } finally {
    await cleanup([target.personId, bystander.personId, actor.personId]);
  }
});

test("reactivating clears the column and notes the record", async () => {
  const actor = await makeAccount("Reactivating Admin", Role.ADMIN);
  const target = await makeAccount("Restored Applicant");

  try {
    await prisma.$transaction((tx) =>
      deactivateAccount(tx, target.userId, actor, { reason: "Mistake" }),
    );
    await prisma.$transaction((tx) =>
      reactivateAccount(tx, target.userId, actor, { reason: null }),
    );

    const account = await prisma.user.findUniqueOrThrow({
      where: { id: target.userId },
      select: { deactivatedAt: true },
    });
    assert.equal(account.deactivatedAt, null);

    const notes = await notesOn(target.personId);
    assert.equal(notes.length, 2, "one per direction");
    const reactivated = notes.find((n) => /reactivated/.test(n.content));
    assert.ok(reactivated);
    assert.ok(!/Reason:/.test(reactivated.content), "no reason was given");
    const events = await prisma.noteEvent.count({
      where: { targetId: { in: notes.map((n) => n.id) } },
    });
    assert.equal(events, 2, "each note has its event");
  } finally {
    await cleanup([target.personId, actor.personId]);
  }
});

test("a reason given on reactivation is kept", async () => {
  const actor = await makeAccount("Reasoning Admin", Role.ADMIN);
  const target = await makeAccount("Appealed Applicant");

  try {
    await prisma.$transaction((tx) =>
      deactivateAccount(tx, target.userId, actor, { reason: "Suspected spam" }),
    );
    await prisma.$transaction((tx) =>
      reactivateAccount(tx, target.userId, actor, {
        reason: "Confirmed genuine by phone",
      }),
    );

    const notes = await notesOn(target.personId);
    assert.ok(notes.some((n) => /Confirmed genuine by phone/.test(n.content)));
  } finally {
    await cleanup([target.personId, actor.personId]);
  }
});

// A refusal has to leave nothing behind: a note recording a deactivation that
// did not happen would tell the next admin something false.
test("an admin cannot be deactivated", async () => {
  const actor = await makeAccount("Acting Admin", Role.ADMIN);
  const otherAdmin = await makeAccount("Other Admin", Role.ADMIN);

  try {
    await assert.rejects(
      prisma.$transaction((tx) =>
        deactivateAccount(tx, otherAdmin.userId, actor, { reason: "x" }),
      ),
      ConflictError,
    );

    const account = await prisma.user.findUniqueOrThrow({
      where: { id: otherAdmin.userId },
      select: { deactivatedAt: true },
    });
    assert.equal(account.deactivatedAt, null);
    assert.equal((await notesOn(otherAdmin.personId)).length, 0);
  } finally {
    await cleanup([otherAdmin.personId, actor.personId]);
  }
});

test("the caller cannot deactivate their own account", async () => {
  // Not an admin on purpose: the self-guard has to hold on its own rather than
  // by way of the admin exclusion, or a future role that may deactivate
  // people could lock itself out.
  const actor = await makeAccount("Self Deactivator", Role.STAFF);

  try {
    await assert.rejects(
      prisma.$transaction((tx) =>
        deactivateAccount(tx, actor.userId, actor, { reason: "x" }),
      ),
      /your own account/,
    );

    const account = await prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { deactivatedAt: true },
    });
    assert.equal(account.deactivatedAt, null);
  } finally {
    await cleanup([actor.personId]);
  }
});

test("deactivating twice writes one note, and an unknown user is not found", async () => {
  const actor = await makeAccount("Repeating Admin", Role.ADMIN);
  const target = await makeAccount("Twice Deactivated");

  try {
    await prisma.$transaction((tx) =>
      deactivateAccount(tx, target.userId, actor, { reason: "First" }),
    );
    await assert.rejects(
      prisma.$transaction((tx) =>
        deactivateAccount(tx, target.userId, actor, { reason: "Second" }),
      ),
      /already deactivated/,
    );
    assert.equal((await notesOn(target.personId)).length, 1);

    await assert.rejects(
      prisma.$transaction((tx) =>
        deactivateAccount(tx, `missing-${runId}`, actor, { reason: "x" }),
      ),
      NotFoundError,
    );
  } finally {
    await cleanup([target.personId, actor.personId]);
  }
});

test("reactivating an account that is not deactivated is refused", async () => {
  const actor = await makeAccount("Idle Admin", Role.ADMIN);
  const target = await makeAccount("Never Deactivated");

  try {
    await assert.rejects(
      prisma.$transaction((tx) =>
        reactivateAccount(tx, target.userId, actor, { reason: null }),
      ),
      /not deactivated/,
    );
    assert.equal((await notesOn(target.personId)).length, 0);
  } finally {
    await cleanup([target.personId, actor.personId]);
  }
});
