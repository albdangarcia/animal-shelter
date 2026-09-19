import type { TransactionClient } from "@/app/lib/prisma";

/**
 * The single writer of `User.name` and `User.email`.
 *
 * Better Auth requires both columns on its own user table, but the values of
 * record live on `Person`. Nothing kept the two halves of one human in step,
 * so a rename or a corrected address moved one and left the other: the sidebar
 * and the AI chat read `user.name`, and `user.email` is what Better Auth
 * matches a returning sign-in against — a corrected address that never reached
 * `User` would keep letting that person in under the address the shelter no
 * longer has for them.
 *
 * Called inside the caller's `prisma.$transaction`, beside the `Person` write
 * it mirrors, so the two rows cannot end up disagreeing because the second
 * statement failed.
 *
 * Like `note-audit`, this module has **no `next/*` and no auth imports**, so a
 * plain `node:test` or a script can drive it. The only Prisma dependency is a
 * type-only import, erased at build.
 */

export interface PersonContact {
  name: string;
  /**
   * Omit (or pass `null`/`""`) to leave `User.email` alone. Two different
   * reasons land here and both mean "do not touch the login address":
   * the person's email was cleared — `User` has no account without one, so it
   * must not be blanked — or the address they typed belongs to somebody else,
   * which the caller has already detected and declined to copy over.
   */
  email?: string | null;
}

/** Which table already holds an address, when one does. */
export type EmailConflict = "person" | "user";

/**
 * Whether `email` is already on some other human's record.
 *
 * Both tables have to be asked. `Person.email` and `User.email` each carry
 * their own unique index, and they are not kept in lockstep in either
 * direction: clearing a person's email nulls `Person.email` and deliberately
 * leaves the login address standing, and every row written before this module
 * existed drifted freely. So an address held by no `Person` can still be held
 * by a `User`, and a write that only checked `persons` would hand the unique
 * index on `users` a duplicate.
 *
 * That matters more than a clumsy error message. Inside a transaction the
 * violation aborts everything the caller has done so far, so an unchecked
 * contact-detail sync can take an adoption application down with it.
 *
 * Lowercased because the normalization extension rewrites writes and passes
 * `where` through untouched, so a stored (always lowercase) address only
 * matches a lowercase probe.
 */
export const findEmailConflict = async (
  client: Pick<TransactionClient, "person" | "user">,
  email: string | null | undefined,
  personId: string,
): Promise<EmailConflict | null> => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  const person = await client.person.findFirst({
    where: { email: normalized, id: { not: personId } },
    select: { id: true },
  });
  if (person) return "person";

  const account = await client.user.findFirst({
    where: { email: normalized, personId: { not: personId } },
    select: { id: true },
  });
  return account ? "user" : null;
};

export const syncPersonToUser = async (
  // Accepts the extended client or a transaction client: both expose `user`.
  client: Pick<TransactionClient, "user">,
  personId: string,
  contact: PersonContact,
): Promise<void> => {
  // A person with no account is the ordinary case here (every walk-in), so
  // the absence of a row is a no-op rather than a P2025.
  const account = await client.user.findUnique({
    where: { personId },
    select: { id: true, email: true },
  });
  if (!account) return;

  // Stored addresses are always lowercase (the normalization extension), so
  // lowercasing the incoming one is what makes this comparison mean "is this
  // a different address" rather than "was it typed differently".
  const email = contact.email ? contact.email.trim().toLowerCase() : null;
  const isNewAddress = email !== null && email !== account.email;

  await client.user.update({
    where: { id: account.id },
    data: {
      name: contact.name,
      // `emailVerified` has to fall with the address it describes. Better Auth
      // sets it when a provider vouches for the email it supplied; carrying it
      // over to an address typed into a staff form would leave the row
      // asserting that somebody verified an address nobody verified.
      //
      // It is not cosmetic. Better Auth reads exactly this flag to decide
      // whether to fold an incoming OAuth login into an existing account: a
      // provider-verified sign-in whose email matches a local row that is
      // itself marked verified gets linked to that row, no further proof
      // asked. Leaving the flag true would therefore turn "edit someone's
      // email" into "hand their account to whoever controls the new address",
      // which is a privilege escalation wherever the edited account outranks
      // the editor. False means the link is refused and the account's existing
      // sign-in methods keep working, which is the intended outcome.
      ...(isNewAddress ? { email, emailVerified: false } : {}),
    },
  });
};
