// Same reasoning as extension-email.test.ts for living under prisma/ and
// running via `npm run test:db`: these need a real Postgres, because what is
// under test is what the unique indexes and the stored rows actually do.
//
// The subject is the single writer of `User.name` / `User.email` and the
// conflict probe that guards it. Both exist because `Person` and `User` each
// hold a copy of one human's contact details behind their own unique index,
// and neither the copies nor the indexes are automatically in step.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import {
  findEmailConflict,
  syncPersonToUser,
} from "@/app/lib/services/user-person-sync";

const runId = Date.now().toString(36);

after(() => prisma.$disconnect());

/** A Person with a linked, verified account — what every account here is. */
const makeLinked = async (label: string, email: string) => {
  const person = await prisma.person.create({
    data: { name: label, email },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { name: label, email, emailVerified: true, personId: person.id },
    select: { id: true },
  });
  return { personId: person.id, userId: user.id };
};

const cleanup = async (personIds: string[]) => {
  // User first: Person.onDelete is Restrict.
  await prisma.user.deleteMany({ where: { personId: { in: personIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
};

// The flag Better Auth reads to decide whether a provider-verified sign-in may
// be folded into an existing account without further proof. Carrying it across
// an address change would mean the row vouches for an address nobody verified,
// and would hand the account to whoever controls the new address.
test("a new login address is never inherited as verified", async () => {
  const { personId } = await makeLinked("Sync Probe", `Sync.${runId}@Example.com`);

  try {
    await syncPersonToUser(prisma, personId, {
      name: "Sync Probe",
      email: `Moved.${runId}@Example.com`,
    });

    const moved = await prisma.user.findUniqueOrThrow({
      where: { personId },
      select: { email: true, emailVerified: true },
    });
    assert.equal(moved.email, `moved.${runId}@example.com`);
    assert.equal(moved.emailVerified, false);

    // Re-verify, then write the same address back in a different case. That is
    // not a new address and must not cost the account its verification.
    await prisma.user.update({ where: { personId }, data: { emailVerified: true } });
    await syncPersonToUser(prisma, personId, {
      name: "Renamed Only",
      email: `MOVED.${runId}@EXAMPLE.COM`,
    });

    const unchanged = await prisma.user.findUniqueOrThrow({
      where: { personId },
      select: { email: true, emailVerified: true, name: true },
    });
    assert.equal(unchanged.emailVerified, true);
    assert.equal(unchanged.name, "Renamed Only", "the name still syncs");

    // `User.email` is non-nullable, so clearing the person's email leaves the
    // login address standing — and leaves the flag describing it alone too.
    await syncPersonToUser(prisma, personId, { name: "Renamed Only", email: null });
    const kept = await prisma.user.findUniqueOrThrow({
      where: { personId },
      select: { email: true, emailVerified: true },
    });
    assert.equal(kept.email, `moved.${runId}@example.com`);
    assert.equal(kept.emailVerified, true);
  } finally {
    await cleanup([personId]);
  }
});

test("a person with no account is a no-op, not a missing-row error", async () => {
  const walkIn = await prisma.person.create({
    data: { name: "Walk In", email: `walkin.${runId}@example.com` },
    select: { id: true },
  });

  try {
    await syncPersonToUser(prisma, walkIn.id, {
      name: "Walk In",
      email: `walkin.${runId}@example.com`,
    });
  } finally {
    await cleanup([walkIn.id]);
  }
});

// The case a `persons`-only check misses. Clearing a linked person's email
// nulls `Person.email` and deliberately leaves the login address standing, so
// an address can be held by a `User` and by no `Person` at all. A write that
// asked only about `persons` would hand `users.email` a duplicate — and inside
// a transaction that aborts everything the caller has already done.
test("findEmailConflict asks both unique indexes", async () => {
  const subject = await prisma.person.create({
    data: { name: "Subject", email: `subject.${runId}@example.com` },
    select: { id: true },
  });
  const other = await prisma.person.create({
    data: { name: "Other Person", email: `other.${runId}@example.com` },
    select: { id: true },
  });
  const orphan = await prisma.person.create({
    data: { name: "Orphan Holder", email: null },
    select: { id: true },
  });
  await prisma.user.create({
    data: {
      name: "Orphan Holder",
      email: `orphan.${runId}@example.com`,
      personId: orphan.id,
    },
  });

  try {
    assert.equal(
      await findEmailConflict(prisma, `OTHER.${runId}@Example.com`, subject.id),
      "person",
    );
    assert.equal(
      await findEmailConflict(prisma, `Orphan.${runId}@Example.com`, subject.id),
      "user",
      "an address on a User and no Person is still taken",
    );
    assert.equal(
      await findEmailConflict(prisma, `subject.${runId}@example.com`, subject.id),
      null,
      "a person does not conflict with themselves",
    );
    assert.equal(await findEmailConflict(prisma, "", subject.id), null);
    assert.equal(await findEmailConflict(prisma, null, subject.id), null);
  } finally {
    await cleanup([subject.id, other.id, orphan.id]);
  }
});
