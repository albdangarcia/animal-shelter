// Same reasoning as extension-email.test.ts for living under prisma/ and
// running via `npm run test:db`: the hook reads `users.deactivated_at`, and
// what is under test is the refusal it produces from a real row.
//
// The hook is called directly, the way that file drives the sign-up hook, so
// there is no better-auth request to construct. Which endpoint reaches it — a
// credentials sign-in or an OAuth callback — is better-auth's business; that
// every one of them creates its session through this hook is the property
// being relied on, and it is the same one the admin plugin's ban check does.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { APIError } from "better-auth";
import prisma from "@/app/lib/prisma";
import { authOptions, DEACTIVATED_ACCOUNT_CODE } from "@/auth.options";

const runId = Date.now().toString(36);

after(() => prisma.$disconnect());

const makeAccount = async (deactivatedAt: Date | null) => {
  const person = await prisma.person.create({
    data: { name: `Deactivation Probe ${runId}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      name: `Deactivation Probe ${runId}`,
      email: `deactivation.${runId}@example.com`,
      emailVerified: true,
      personId: person.id,
      deactivatedAt,
    },
    select: { id: true },
  });
  return { personId: person.id, userId: user.id };
};

const cleanup = async ({ personId, userId }: { personId: string; userId: string }) => {
  await prisma.user.delete({ where: { id: userId } });
  await prisma.person.delete({ where: { id: personId } });
};

const before = authOptions(prisma).databaseHooks.session.create.before;

test("a deactivated account is refused a session, with a named error", async () => {
  const account = await makeAccount(new Date());
  try {
    await assert.rejects(before({ userId: account.userId }), (error) => {
      assert.ok(error instanceof APIError, "an APIError, not a bare throw");
      assert.equal(error.status, "FORBIDDEN");
      assert.equal(error.body?.code, DEACTIVATED_ACCOUNT_CODE);
      assert.match(String(error.body?.message), /deactivated/i);
      return true;
    });
  } finally {
    await cleanup(account);
  }
});

test("reactivating the account restores sign-in", async () => {
  const account = await makeAccount(new Date());
  try {
    await prisma.user.update({
      where: { id: account.userId },
      data: { deactivatedAt: null },
    });
    await assert.doesNotReject(before({ userId: account.userId }));
  } finally {
    await cleanup(account);
  }
});

test("an active account is not refused", async () => {
  const account = await makeAccount(null);
  try {
    await assert.doesNotReject(before({ userId: account.userId }));
  } finally {
    await cleanup(account);
  }
});
