// Same reasoning as extension-phone.test.ts for living under prisma/ and
// running via `npm run test:db`.
//
// Every write below goes through a raw client call that never lowercases. That
// is the whole point: it proves the extension, not the call sites.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { authOptions } from "@/auth.options";

// Unique per run so a crashed earlier run cannot collide with this one.
const runId = Date.now().toString(36);

// extension-phone.test.ts disconnects in its single test's `finally`; this file
// has several tests, so that pattern only closes the pool when the last one is
// reached. A throw outside any `try` — the setup at the top of a test, say —
// would leave the pg pool holding the event loop open, and node:test does not
// force-exit, so `npm run test:db` would hang instead of reporting the failure.
after(() => prisma.$disconnect());

test("Person.email is lowercased with no help from the call site", async (t) => {
  const email = `Extension.Probe.${runId}@Example.com`;
  const person = await prisma.person.create({
    data: { name: "Email Probe", email },
    select: { id: true, email: true },
  });

  try {
    await t.test("create", () => {
      assert.equal(person.email, email.toLowerCase());
    });

    await t.test("update with the { set: ... } wrapper", async () => {
      const updated = await prisma.person.update({
        where: { id: person.id },
        data: { email: { set: `Renamed.${runId}@Example.com` } },
        select: { email: true },
      });
      assert.equal(updated.email, `renamed.${runId}@example.com`);
    });

    await t.test("tx.person.update inside $transaction", async () => {
      await prisma.$transaction(async (tx) => {
        await tx.person.update({
          where: { id: person.id },
          data: { email: `InTx.${runId}@Example.com` },
        });
      });

      const refetched = await prisma.person.findUniqueOrThrow({
        where: { id: person.id },
        select: { email: true },
      });
      assert.equal(refetched.email, `intx.${runId}@example.com`);
    });

    await t.test("an unrelated edit does not touch the column", async () => {
      const renamed = await prisma.person.update({
        where: { id: person.id },
        data: { name: "Email Probe (renamed)" },
        select: { email: true },
      });
      assert.equal(renamed.email, `intx.${runId}@example.com`);
    });

    await t.test("clearing email preserves null", async () => {
      const cleared = await prisma.person.update({
        where: { id: person.id },
        data: { email: null },
        select: { email: true },
      });
      assert.equal(cleared.email, null);
    });

    // The hole the extension closes: the unique index alone would have let a
    // case-variant twin of the same human in.
    await t.test("a case-variant of an existing email is rejected", async () => {
      await prisma.person.update({
        where: { id: person.id },
        data: { email: `Twin.${runId}@Example.com` },
      });
      await assert.rejects(
        prisma.person.create({
          data: { name: "Twin", email: `TWIN.${runId}@example.com` },
        }),
        { code: "P2002" },
      );
    });
  } finally {
    await prisma.person.delete({ where: { id: person.id } });
  }
});

// The reported defect end to end: staff record a mixed-case address, the
// account is created with the provider's lowercase one, and the account must
// link to the existing Person rather than mint a second one.
test("the sign-up hook links a Person recorded with a mixed-case email", async () => {
  const staffTyped = `Link.Probe.${runId}@Example.com`;
  const providerReported = staffTyped.toLowerCase();

  const existing = await prisma.person.create({
    data: { name: "Link Probe", email: staffTyped },
    select: { id: true },
  });

  try {
    const before = authOptions(prisma).databaseHooks.user.create.before;
    const result = await before({
      id: "unused",
      name: "Link Probe",
      email: providerReported,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    assert.deepEqual(result, {
      data: { personId: existing.id, emailVerified: true },
    });

    const notes = await prisma.personNote.findMany({
      where: { personId: existing.id },
      select: { content: true },
    });
    assert.equal(notes.length, 1);
    assert.match(notes[0].content, /Auto-linked on account creation/);

    const rows = await prisma.person.count({ where: { email: providerReported } });
    assert.equal(rows, 1);
  } finally {
    await prisma.personNote.deleteMany({ where: { personId: existing.id } });
    await prisma.person.delete({ where: { id: existing.id } });
  }
});

// The hook must not depend on better-auth having lowercased the email first:
// the extension normalizes writes only, so the lookup is case-insensitive
// purely because the hook lowercases its own input. Feeding it a mixed-case
// address directly is what fails if that line is ever removed as redundant.
test("the sign-up hook lowercases its own input rather than trusting the caller", async () => {
  const mixedCase = `Hook.Probe.${runId}@Example.com`;

  const existing = await prisma.person.create({
    data: { name: "Hook Probe", email: mixedCase },
    select: { id: true },
  });

  try {
    const before = authOptions(prisma).databaseHooks.user.create.before;
    const result = await before({
      id: "unused",
      name: "Hook Probe",
      email: mixedCase,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    assert.deepEqual(result, {
      data: { personId: existing.id, emailVerified: true },
    });

    const [note] = await prisma.personNote.findMany({
      where: { personId: existing.id },
      select: { content: true },
    });
    assert.ok(note.content.includes(`(${mixedCase.toLowerCase()})`));
  } finally {
    await prisma.personNote.deleteMany({ where: { personId: existing.id } });
    await prisma.person.delete({ where: { id: existing.id } });
  }
});

test("User.email is lowercased with no help from the call site", async () => {
  const person = await prisma.person.create({
    data: { name: "User Email Probe" },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      name: "User Email Probe",
      email: `User.Probe.${runId}@Example.com`,
      personId: person.id,
    },
    select: { id: true, email: true },
  });

  try {
    assert.equal(user.email, `user.probe.${runId}@example.com`);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { email: `Changed.${runId}@Example.com` },
      select: { email: true },
    });
    assert.equal(updated.email, `changed.${runId}@example.com`);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.person.delete({ where: { id: person.id } });
  }
});

// The hook's fallback creates a Person on an email it has just proven may be
// taken: the verified branch links only when the matched Person has no account,
// so a match that already has one falls straight through to the create with
// that same address. Uncaught, the unique-index violation is a 500 and the
// person signing up has no route in at all.
//
// Reachable when a shelter record carries the wrong email — staff put Bob's
// address on Jane's row while Jane's own account keeps hers — and Bob then
// signs up. Better Auth finds no User with Bob's address so it calls
// createUser, the hook matches Jane's Person, skips the link, and collides.
test("the sign-up hook reports the collision its fallback create can hit", async () => {
  const contested = `Contested.${runId}@Example.com`;

  const owner = await prisma.person.create({
    data: { name: "Record Owner", email: contested },
    select: { id: true },
  });
  const ownersAccount = await prisma.user.create({
    data: {
      name: "Record Owner",
      email: `owner.${runId}@example.com`,
      personId: owner.id,
    },
    select: { id: true },
  });

  try {
    const before = authOptions(prisma).databaseHooks.user.create.before;
    await assert.rejects(
      () =>
        before({
          id: "unused",
          name: "Rightful Owner",
          email: contested,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      (error: unknown) => {
        const named = error as { statusCode?: number; message?: string };
        assert.equal(named.statusCode, 409);
        assert.match(String(named.message), /already recorded on a shelter record/);
        // The address is in the message: whoever reads the failure has to be
        // able to tell the shelter which record to look at.
        assert.ok(String(named.message).includes(contested.toLowerCase()));
        return true;
      },
    );

    // The collision must leave nothing behind — no half-made second Person for
    // the same address.
    const rows = await prisma.person.count({
      where: { email: contested.toLowerCase() },
    });
    assert.equal(rows, 1);
  } finally {
    await prisma.user.delete({ where: { id: ownersAccount.id } });
    await prisma.person.delete({ where: { id: owner.id } });
  }
});

// Same collision, reached by the other route: the hook only reads Person when
// the email is provider-verified, so an unverified sign-up skips the lookup and
// falls straight into the create. GitHub allows an unverified primary email, so
// its provider hands better-auth `emailVerified: false` and the app instance
// never sets `trustProvidedEmails` — the route is live in production.
//
// Nothing here has proven the address is the caller's, so the failure must not
// tell them it is on a record. For a shelter that fact alone says the person
// dealt with the organisation, and an attacker sets the probe rate at GitHub,
// not at this app.
test("an unverified sign-up is not told whose address collided", async () => {
  const contested = `Unverified.${runId}@Example.com`;

  const onRecord = await prisma.person.create({
    data: { name: "On A Shelter Record", email: contested },
    select: { id: true },
  });

  try {
    const before = authOptions(prisma).databaseHooks.user.create.before;
    await assert.rejects(
      () =>
        before({
          id: "unused",
          name: "Unverified Caller",
          email: contested,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      (error: unknown) => {
        const named = error as { statusCode?: number; message?: string };
        // Still the same 409 — the caller cannot register, and the app still
        // knows why. Only the wording changes.
        assert.equal(named.statusCode, 409);
        assert.doesNotMatch(
          String(named.message),
          /already recorded on a shelter record/,
        );
        assert.ok(!String(named.message).includes(contested.toLowerCase()));
        assert.ok(!String(named.message).includes(contested));
        return true;
      },
    );

    // The Person on record is untouched: no second row, and no auto-link to an
    // account the caller never proved was theirs.
    const rows = await prisma.person.findMany({
      where: { email: contested.toLowerCase() },
      select: { id: true, user: { select: { id: true } } },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, onRecord.id);
    assert.equal(rows[0].user, null);
  } finally {
    await prisma.person.delete({ where: { id: onRecord.id } });
  }
});
