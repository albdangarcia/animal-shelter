// Same reasoning as user-person-sync.test.ts for living under prisma/ and
// running via `npm run test:db`: these need a real Postgres. What is under
// test is where rows end up after the link moves — which `Person` keeps the
// applications, which unique index the moved address lands on, and whether
// both records carry a note — and none of that is observable without the
// indexes and the foreign keys actually enforcing themselves.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { NoteEventAction, NoteTargetType } from "@/prisma/generated/enums";
import { unlinkAccountFromPerson } from "@/app/lib/services/person-account-unlink";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";

const runId = Date.now().toString(36);

after(() => prisma.$disconnect());

/** The actor: an admin doing the unlinking, who is never the unlink target. */
const makeActor = async () => {
  const person = await prisma.person.create({
    data: { name: `Unlink Actor ${runId}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      name: `Unlink Actor ${runId}`,
      email: `actor.${runId}@example.com`,
      emailVerified: true,
      personId: person.id,
    },
    select: { id: true },
  });
  return { userId: user.id, personId: person.id };
};

/**
 * The state the bug produces: one `Person` record, holding an address that is
 * really somebody else's, with that somebody else's account auto-linked to it.
 */
const makeMislink = async (label: string, email: string) => {
  const person = await prisma.person.create({
    data: { name: label, email, phone: "212-555-0100" },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      name: `${label} Account`,
      email,
      emailVerified: true,
      personId: person.id,
    },
    select: { id: true },
  });
  return { personId: person.id, userId: user.id };
};

const cleanup = async (personIds: string[]) => {
  // Users first: Person.onDelete is Restrict. So is NoteEvent.actor, and the
  // actor is always in `personIds`.
  await prisma.user.deleteMany({ where: { personId: { in: personIds } } });
  await prisma.noteEvent.deleteMany({ where: { actorId: { in: personIds } } });
  await prisma.personNote.deleteMany({
    where: { personId: { in: personIds } },
  });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
};

test("the login moves to a new record and the history stays behind", async (t) => {
  const actor = await makeActor();
  const email = `mislinked.${runId}@example.com`;
  const { personId, userId } = await makeMislink("Bob Recordholder", email);

  // Something on the original record that must not travel with the account.
  const note = await prisma.personNote.create({
    data: { personId, content: "Walked in about a terrier on Tuesday." },
    select: { id: true },
  });

  let replacementPersonId = "";

  try {
    const result = await prisma.$transaction((tx) =>
      unlinkAccountFromPerson(tx, personId, actor),
    );
    replacementPersonId = result.replacementPersonId;

    await t.test("the account keeps working, on a record of its own", async () => {
      const account = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { personId: true, email: true, emailVerified: true },
      });
      assert.equal(account.personId, replacementPersonId);
      assert.equal(account.email, email, "the sign-in address is untouched");
      assert.equal(account.emailVerified, true);
    });

    await t.test("the original record is staff-editable again", async () => {
      const original = await prisma.person.findUniqueOrThrow({
        where: { id: personId },
        select: { user: { select: { id: true } }, phone: true },
      });
      assert.equal(original.user, null);
      assert.equal(original.phone, "212-555-0100", "its details are intact");
    });

    await t.test("its notes stay on the record they were about", async () => {
      const stayed = await prisma.personNote.findUniqueOrThrow({
        where: { id: note.id },
        select: { personId: true },
      });
      assert.equal(stayed.personId, personId);
    });

    await t.test("the replacement starts empty", async () => {
      const replacement = await prisma.person.findUniqueOrThrow({
        where: { id: replacementPersonId },
        select: { phone: true, address: true, adoptionApplications: true },
      });
      assert.equal(replacement.phone, null);
      assert.equal(replacement.address, null);
      assert.deepEqual(replacement.adoptionApplications, []);
    });

    await t.test("both records are noted, by the actor", async () => {
      for (const id of [personId, replacementPersonId]) {
        const notes = await prisma.personNote.findMany({
          where: { personId: id, content: { contains: "unlink" } },
          select: { authorId: true },
        });
        assert.equal(notes.length, 1, `exactly one unlink note on ${id}`);
        assert.equal(notes[0].authorId, actor.personId);
      }
    });

    // The invariant at the top of note-audit: every note mutation writes one
    // NoteEvent, keyed on the note's id.
    await t.test("each note has its NoteEvent, by the actor", async () => {
      for (const id of [personId, replacementPersonId]) {
        const unlinkNote = await prisma.personNote.findFirstOrThrow({
          where: { personId: id, content: { contains: "unlink" } },
          select: { id: true },
        });
        const events = await prisma.noteEvent.findMany({
          where: { targetId: unlinkNote.id },
          select: { targetType: true, action: true, actorId: true },
        });
        assert.deepEqual(events, [
          {
            targetType: NoteTargetType.PERSON,
            action: NoteEventAction.CREATED,
            actorId: actor.personId,
          },
        ]);
      }
    });
  } finally {
    await cleanup([personId, replacementPersonId, actor.personId]);
  }
});

// The address is the whole reason the link went wrong: the hook matches a
// provider-verified email against `Person.email`. Leaving it on the record the
// account is being detached from would leave the next sign-up free to re-link
// exactly the same way.
test("the sign-in address leaves with the account when the record held it", async () => {
  const actor = await makeActor();
  const email = `follows.${runId}@example.com`;
  const { personId } = await makeMislink("Address Holder", email);

  let replacementPersonId = "";

  try {
    const result = await prisma.$transaction((tx) =>
      unlinkAccountFromPerson(tx, personId, actor),
    );
    replacementPersonId = result.replacementPersonId;
    assert.equal(result.addressFollowedAccount, true);

    const original = await prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { email: true },
    });
    assert.equal(original.email, null);

    const replacement = await prisma.person.findUniqueOrThrow({
      where: { id: replacementPersonId },
      select: { email: true, name: true },
    });
    assert.equal(replacement.email, email);
    assert.equal(
      replacement.name,
      "Address Holder Account",
      "the name comes off the account, not off the record it is leaving",
    );
  } finally {
    await cleanup([personId, replacementPersonId, actor.personId]);
  }
});

// The two columns are not kept in lockstep in either direction, so the record
// can hold a different address than the account signs in with. Which of the
// two humans owns it is not something this can work out, so it leaves both.
test("a record holding a different address keeps it", async () => {
  const actor = await makeActor();
  const accountEmail = `differs.account.${runId}@example.com`;
  const recordEmail = `differs.record.${runId}@example.com`;

  const person = await prisma.person.create({
    data: { name: "Divergent Record", email: recordEmail },
    select: { id: true },
  });
  await prisma.user.create({
    data: {
      name: "Divergent Account",
      email: accountEmail,
      emailVerified: true,
      personId: person.id,
    },
  });

  let replacementPersonId = "";

  try {
    const result = await prisma.$transaction((tx) =>
      unlinkAccountFromPerson(tx, person.id, actor),
    );
    replacementPersonId = result.replacementPersonId;
    assert.equal(result.addressFollowedAccount, false);

    const original = await prisma.person.findUniqueOrThrow({
      where: { id: person.id },
      select: { email: true },
    });
    assert.equal(original.email, recordEmail, "untouched");

    const replacement = await prisma.person.findUniqueOrThrow({
      where: { id: replacementPersonId },
      select: { email: true },
    });
    assert.equal(replacement.email, accountEmail);
  } finally {
    await cleanup([person.id, replacementPersonId, actor.personId]);
  }
});

// `Person.email` is unique, so the replacement cannot take an address a third
// record already holds. Failing the whole unlink on that would leave the
// mislink in place, which is the worse outcome.
test("a third record holding the address leaves the replacement without one", async () => {
  const actor = await makeActor();
  const accountEmail = `contested.${runId}@example.com`;

  const person = await prisma.person.create({
    data: { name: "Contested Record", email: null },
    select: { id: true },
  });
  await prisma.user.create({
    data: {
      name: "Contested Account",
      email: accountEmail,
      emailVerified: true,
      personId: person.id,
    },
  });
  const thirdParty = await prisma.person.create({
    data: { name: "Third Party", email: accountEmail },
    select: { id: true },
  });

  let replacementPersonId = "";

  try {
    const result = await prisma.$transaction((tx) =>
      unlinkAccountFromPerson(tx, person.id, actor),
    );
    replacementPersonId = result.replacementPersonId;

    const replacement = await prisma.person.findUniqueOrThrow({
      where: { id: replacementPersonId },
      select: { email: true },
    });
    assert.equal(replacement.email, null);

    const notes = await prisma.personNote.findMany({
      where: { personId: replacementPersonId },
      select: { content: true },
    });
    assert.equal(notes.length, 1);
    assert.match(notes[0].content, /already on another person record/);

    const third = await prisma.person.findUniqueOrThrow({
      where: { id: thirdParty.id },
      select: { email: true },
    });
    assert.equal(third.email, accountEmail, "the third record is untouched");
  } finally {
    await cleanup([
      person.id,
      replacementPersonId,
      thirdParty.id,
      actor.personId,
    ]);
  }
});

test("unlinking your own account is refused", async () => {
  const actor = await makeActor();

  try {
    await assert.rejects(
      prisma.$transaction((tx) =>
        unlinkAccountFromPerson(tx, actor.personId, actor),
      ),
      ConflictError,
    );

    const stillLinked = await prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { personId: true },
    });
    assert.equal(stillLinked.personId, actor.personId);
  } finally {
    await cleanup([actor.personId]);
  }
});

test("a walk-in with no account, and a person who does not exist", async () => {
  const actor = await makeActor();
  const walkIn = await prisma.person.create({
    data: { name: `Walk In ${runId}` },
    select: { id: true },
  });

  try {
    await assert.rejects(
      prisma.$transaction((tx) =>
        unlinkAccountFromPerson(tx, walkIn.id, actor),
      ),
      ConflictError,
    );
    await assert.rejects(
      prisma.$transaction((tx) =>
        unlinkAccountFromPerson(tx, "cm0000000000000000000000", actor),
      ),
      NotFoundError,
    );
  } finally {
    await cleanup([walkIn.id, actor.personId]);
  }
});

// The repair has to hold together: an account repointed with no note, or a
// note with no repoint, is worse than no repair at all.
test("nothing lands when the transaction fails", async () => {
  const actor = await makeActor();
  const email = `rollback.${runId}@example.com`;
  const { personId, userId } = await makeMislink("Rollback Probe", email);

  try {
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await unlinkAccountFromPerson(tx, personId, actor);
        throw new Error("forced rollback");
      }),
      /forced rollback/,
    );

    const account = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { personId: true },
    });
    assert.equal(account.personId, personId, "still on the original record");

    const original = await prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { email: true },
    });
    assert.equal(original.email, email, "the address never left");

    const notes = await prisma.personNote.count({ where: { personId } });
    assert.equal(notes, 0);
    const events = await prisma.noteEvent.count({
      where: { actorId: actor.personId },
    });
    assert.equal(events, 0, "no audit row without its note");
  } finally {
    await cleanup([personId, actor.personId]);
  }
});
