import type { TransactionClient } from "@/app/lib/prisma";
import { recordNoteMutation } from "@/app/lib/services/note-audit";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import { NoteEventAction, NoteTargetType } from "@/prisma/generated/enums";

/**
 * Detach a login account from the `Person` it is linked to, and give it a
 * fresh, empty `Person` of its own.
 *
 * The sign-up hook links a new account to an existing `Person` whenever a
 * provider-verified address matches `Person.email`. When the shelter's record
 * carries the wrong address — staff mistype one person's email onto another's
 * row — that match links the account to somebody else's record. From then on
 * the wrong human sees those applications under "My Applications", the right
 * one cannot be helped, and until now the only repair was `psql`.
 *
 * Deleting the account is neither necessary nor wanted: `User.personId` is
 * non-nullable and unique, so the repair is to repoint it. The login keeps
 * working, and the applications, notes and history stay on the record they
 * were always about — which, with the link gone, staff can edit again.
 *
 * This is **not** the answer to "the applicant cannot reach their own
 * account". Unlinking restores nobody's access; it only separates two humans
 * who ended up sharing one record. Staff help a person who still owns their
 * account by editing the record directly, and that path stays open precisely
 * so this one is never reached for as a substitute.
 *
 * Like `user-person-sync` and `note-audit`, this module has **no `next/*` and
 * no auth imports**, so a plain `node:test` can drive it. It runs inside the
 * caller's `prisma.$transaction`: every write below has to land together or
 * not at all, or a failure halfway leaves an account pointing at a record that
 * says nothing about how it got there.
 */

export interface UnlinkedAccount {
  /** The empty `Person` the account now points at. */
  replacementPersonId: string;
  /** Whether the address moved off the original record with the account. */
  addressFollowedAccount: boolean;
}

export const unlinkAccountFromPerson = async (
  tx: TransactionClient,
  personId: string,
  actor: { userId: string; personId: string },
): Promise<UnlinkedAccount> => {
  // Held for the rest of the transaction. Inserting a `User` that references
  // this person takes a FOR KEY SHARE lock on the row for the foreign-key
  // check, which FOR UPDATE conflicts with — so the account read below is the
  // account repointed, and a sign-up cannot link a second one in between and
  // be silently left behind on the record this is clearing.
  await tx.$queryRaw`SELECT id FROM persons WHERE id = ${personId} FOR UPDATE`;

  const person = await tx.person.findUnique({
    where: { id: personId },
    select: {
      name: true,
      email: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!person) {
    throw new NotFoundError("Person not found.");
  }
  if (!person.user) {
    throw new ConflictError(
      "This person has no login account, so there is nothing to unlink.",
    );
  }
  // Unlinking yourself leaves you signed in against a record holding none of
  // what you were looking at, and there is no way back from inside the app.
  // Nobody reaches for this on their own account on purpose.
  if (person.user.id === actor.userId) {
    throw new ConflictError(
      "You cannot unlink your own account from your own record.",
    );
  }

  const account = person.user;

  // `Person.email` is the key the sign-up hook auto-links on, so leaving the
  // account's address on the record it is being detached from would leave the
  // next sign-up free to re-link exactly the way this one did. When the two
  // match, the address leaves with the account.
  //
  // When they differ, neither is touched. Which of the two humans owns an
  // address this cannot know, and a repair that quietly drops a contact detail
  // nobody asked about is worse than one that leaves it on the form where
  // staff will see it.
  const addressFollowedAccount = person.email === account.email;
  if (addressFollowedAccount) {
    await tx.person.update({
      where: { id: personId },
      data: { email: null },
    });
  }

  // Normally nothing holds it by this point, but `Person.email` and
  // `User.email` are not kept in lockstep — clearing a person's email leaves
  // the login address standing, and rows written before there was a single
  // writer drifted freely — so a third record can have it. The replacement
  // then starts with no email rather than failing the whole unlink on a unique
  // index; the note says so, and staff sort it out from the directory.
  const heldElsewhere = await tx.person.findFirst({
    where: { email: account.email },
    select: { id: true },
  });

  // A plain create, then a repoint by id. Creating the replacement as a nested
  // write under the user update would write `Person.email` through a relation,
  // which the email-normalization extension does not see. (Spelled out rather
  // than shown, so the repo-wide grep for nested writes stays a zero-hit
  // check — see the extension's own comment for that command.)
  const replacement = await tx.person.create({
    data: {
      // The best name available, and not necessarily the right one: if staff
      // renamed the record this account was wrongly linked to, the single
      // writer copied that name onto `User` too. The note says where it came
      // from so it gets checked.
      name: account.name,
      email: heldElsewhere ? null : account.email,
    },
    select: { id: true },
  });

  await tx.user.update({
    where: { id: account.id },
    data: { personId: replacement.id },
  });

  const addressNote = addressFollowedAccount
    ? " The email held here was that account's sign-in address, so it left with the account; set this person's own address if you know it."
    : "";
  // The note points at the account holder rather than at staff on purpose.
  // This record has an account now, and `_updatePerson` refuses any email
  // change on one: it copies `Person.email` onto `User.email`, so a staff edit
  // here would move the address the account signs in under — a lockout, with
  // no self-serve reset to recover through. Narrowing that guard to "allow it
  // while the person has no email" would open exactly that hole, so the only
  // one who can fill this in is the account holder, from their own profile.
  const replacementAddressNote = heldElsewhere
    ? " The account's sign-in address is already on another person record, so this one starts with no email. Staff cannot set it — the account holder can add it from their own profile."
    : "";

  // Two creates rather than one `createMany`: `createMany` returns no ids, and
  // every note mutation owes a `NoteEvent` keyed on the note's id. The actor is
  // a real person here, unlike the sign-up hook's system note, so the trail
  // says who did the unlinking.
  const notes = [
    {
      personId,
      content: `Login account (${account.email}) unlinked from this record and moved to a new person record for "${account.name}". Applications, notes and history stay here, and this record is staff-editable again.${addressNote}`,
    },
    {
      personId: replacement.id,
      content: `Created by unlinking a login account (${account.email}) from the record of "${person.name}", which it had been linked to in error. This record starts empty — the applications, notes and history stay on the record they were about. The name here is the one on the account and may need correcting.${replacementAddressNote}`,
    },
  ];
  for (const note of notes) {
    const created = await tx.personNote.create({
      data: { ...note, authorId: actor.personId },
      select: { id: true },
    });
    await recordNoteMutation(tx, {
      targetType: NoteTargetType.PERSON,
      targetId: created.id,
      action: NoteEventAction.CREATED,
      actorId: actor.personId,
    });
  }

  return { replacementPersonId: replacement.id, addressFollowedAccount };
};
