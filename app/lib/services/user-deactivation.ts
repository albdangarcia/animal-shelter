import type { TransactionClient } from "@/app/lib/prisma";
import { recordNoteMutation } from "@/app/lib/services/note-audit";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import {
  NoteEventAction,
  NoteTargetType,
  Role,
} from "@/prisma/generated/enums";

/**
 * Bar a login account from the app, and lift the bar again.
 *
 * `User.deactivatedAt` is the whole of the state: null is an active account,
 * anything else is one that cannot sign in and holds no session. The `User`
 * row, its link to its `Person` and everything hanging off that `Person` stay
 * exactly where they are — this is what lets an account be closed, or an
 * abusive applicant stopped, without destroying shelter history. It is also
 * why it is reversible with no schema change, and why "deactivated" must never
 * be implemented by removing the link: an unlinked account still works.
 *
 * Deactivation is enforced at three points and this module owns one of them:
 * it deletes the account's existing sessions in the same transaction that sets
 * the column. The other two — refusing a new session, and refusing one that
 * slips through — live in `auth.options.ts` and `getCachedSession`. A session
 * created by a sign-in already past the refusal check when this commits is
 * the case that last one exists for.
 *
 * Like `person-account-unlink` and `note-audit`, this module has **no `next/*`
 * and no auth imports**, so a plain `node:test` can drive it. It runs inside
 * the caller's `prisma.$transaction`, so the column, the revoked sessions and
 * the note land together or not at all: a deactivation with no note leaves the
 * next admin with a red badge and no reason, and one with no revoked sessions
 * leaves the badge over an account that still works.
 *
 * ## What this does not do
 *
 * It bars an account, not a human. Someone deactivated can sign up again with
 * a different provider account and get a fresh `Person` and `User`, because
 * the sign-up hook links on email and a new address is a new person to it.
 *
 * Nothing surfaces that today, and the duplicate-person detection is not the
 * thing that would: `findDuplicate` and `_fetchDuplicatePersonCandidate`
 * compare email and phone, while the record the sign-up hook creates holds a
 * name and an email and no phone at all — and a new address is what made it a
 * new person in the first place, so neither key can match. They also run only
 * from the staff person form, never from a self-service profile edit. Name is
 * compared nowhere. Wiring them to deactivation would not close this.
 *
 * What exists instead is a human signal: an applicant who registers again
 * under their own name appears twice in the people directory, which matches on
 * name as well as email and phone, with the deactivation note sitting on the
 * older record. Automating it is a feature with its own design — which
 * attributes count, whether a match refuses the sign-up or queues it for staff
 * to look at, and what a false positive costs someone who is not the barred
 * applicant — and its trigger is more likely an application submission than a
 * person create, since a phone and an address only arrive then. Not something
 * to bolt on here; stated so it is a known limit and not something found the
 * first time it matters.
 */

type Actor = { userId: string; personId: string };

/**
 * Write the note and its `NoteEvent`. One create per note, never a
 * `createMany`: `createMany` returns no ids, and every note mutation owes a
 * `NoteEvent` keyed on the note's id. The author is a real person, so the
 * trail says who did it.
 *
 * The note carries a reason the admin typed, not just who and when.
 * `deactivatedAt` already answers when, and the note's author and timestamp
 * answer who; what neither can say is why, and "abusive applicant" is exactly
 * the case where the next admin needs it. So a deactivation requires one — the
 * caller validates it — and a reactivation may carry one but does not need to,
 * since undoing a mistaken deactivation should not take a form.
 */
const writeNote = async (
  tx: TransactionClient,
  personId: string,
  actor: Actor,
  content: string,
) => {
  const created = await tx.personNote.create({
    data: { personId, content, authorId: actor.personId },
    select: { id: true },
  });
  await recordNoteMutation(tx, {
    targetType: NoteTargetType.PERSON,
    targetId: created.id,
    action: NoteEventAction.CREATED,
    actorId: actor.personId,
  });
};

/**
 * Why a conditional update touched nothing, as the message the caller shows.
 * The update is the guard — its `where` is what makes the check and the write
 * one statement — so this only runs after it has already refused, to say which
 * of the possible reasons it was.
 */
const explainRefusal = async (
  tx: TransactionClient,
  userId: string,
  wanted: "deactivate" | "reactivate",
): Promise<never> => {
  const account = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!account) {
    throw new NotFoundError("User not found.");
  }
  if (wanted === "deactivate") {
    throw new ConflictError(
      account.role === Role.ADMIN
        ? "This user is an admin and cannot be deactivated here."
        : "This account is already deactivated.",
    );
  }
  throw new ConflictError("This account is not deactivated.");
};

export const deactivateAccount = async (
  tx: TransactionClient,
  userId: string,
  actor: Actor,
  note: { reason: string },
): Promise<{ personId: string }> => {
  // An admin locking out their own account has no undo short of `psql`, and
  // `MANAGE_ROLES` is admin-only, so there may be nobody left to reverse it.
  // Same guard as the admin plugin's `YOU_CANNOT_BAN_YOURSELF`.
  if (userId === actor.userId) {
    throw new ConflictError("You cannot deactivate your own account.");
  }

  // One conditional statement rather than a read and a write, so two admins
  // deactivating the same account write one note between them, not two. The
  // admin exclusion is the same `NOT: { role: ADMIN }` as `_updateUserRole`:
  // the role-management table already leaves admins out of its listing, but
  // this is reachable directly, and deactivating an admin can lock out the
  // whole app.
  const { count } = await tx.user.updateMany({
    where: { id: userId, deactivatedAt: null, NOT: { role: Role.ADMIN } },
    data: { deactivatedAt: new Date() },
  });
  if (count === 0) {
    return explainRefusal(tx, userId, "deactivate");
  }

  // Not cascaded by anything: the `User` row stays, so without this the
  // account keeps working until each session expires.
  await tx.session.deleteMany({ where: { userId } });

  const account = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { personId: true, email: true },
  });
  await writeNote(
    tx,
    account.personId,
    actor,
    `Login account (${account.email}) deactivated. It cannot sign in and its existing sessions were ended; this record, its applications and its history are unchanged. Reason: ${note.reason}`,
  );
  return { personId: account.personId };
};

export const reactivateAccount = async (
  tx: TransactionClient,
  userId: string,
  actor: Actor,
  note: { reason: string | null },
): Promise<{ personId: string }> => {
  // No admin exclusion, unlike deactivating: that guard exists to stop a
  // lockout, and lifting a bar can never cause one. Refusing here would only
  // put an admin deactivated by hand back behind `psql`.
  const { count } = await tx.user.updateMany({
    where: { id: userId, deactivatedAt: { not: null } },
    data: { deactivatedAt: null },
  });
  if (count === 0) {
    return explainRefusal(tx, userId, "reactivate");
  }

  const account = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { personId: true, email: true },
  });
  await writeNote(
    tx,
    account.personId,
    actor,
    note.reason
      ? `Login account (${account.email}) reactivated. It can sign in again. Reason: ${note.reason}`
      : `Login account (${account.email}) reactivated. It can sign in again.`,
  );
  return { personId: account.personId };
};
