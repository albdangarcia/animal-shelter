import type { TransactionClient } from "@/app/lib/prisma";
import { recordNoteMutation } from "@/app/lib/services/note-audit";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { ConflictError, NotFoundError } from "@/app/lib/utils/errors";
import { NoteEventAction, NoteTargetType } from "@/prisma/generated/enums";

/**
 * Soft-delete and restore for the three kinds of note (animal, person,
 * partner), run inside the caller's `prisma.$transaction`.
 *
 * Each function looks the note up by its id **and** its owner (the animal,
 * person or partner the request says it belongs to), so a note id paired with
 * the wrong owner is "not found" rather than silently changed. A delete of a
 * note that is already deleted, or a restore of one that is live, is refused
 * instead of being written again: a second write would stamp
 * `lastEditedBy`/`lastEditedAt` and add an audit row for something that did
 * not happen.
 *
 * A refusal throws `NotFoundError` or `ConflictError` before anything is
 * written, and the caller's transaction rolls back if a later write fails, so
 * the note row and its audit rows land together or not at all. The action
 * turns a refusal into a failed `FormResult` with `noteRefusalMessage`.
 *
 * Like `note-audit` and `person-account-unlink`, this module has **no `next/*`
 * and no auth imports**, so a plain `node:test` can drive it.
 */

const NOT_FOUND = "Note not found.";
const ALREADY_DELETED = "This note is already deleted.";
const NOT_DELETED = "This note is not deleted, so there is nothing to restore.";

/**
 * The message to show for an error thrown by this module's refusals, or
 * `null` for anything else (a database failure, which the caller reports and
 * logs in its own words).
 */
export const noteRefusalMessage = (error: unknown): string | null =>
  error instanceof NotFoundError || error instanceof ConflictError
    ? error.message
    : null;

/** Delete (`deletedAt` set) or restore (`deletedAt` cleared). */
type Change = "delete" | "restore";

const ACTION_BY_CHANGE: Record<Change, NoteEventAction> = {
  delete: NoteEventAction.DELETED,
  restore: NoteEventAction.RESTORED,
};

/** The refusal for a note whose state does not allow `change`, or `null`. */
const refusalFor = (
  change: Change,
  note: { deletedAt: Date | null },
): ConflictError | null => {
  if (change === "delete" && note.deletedAt !== null) {
    return new ConflictError(ALREADY_DELETED);
  }
  if (change === "restore" && note.deletedAt === null) {
    return new ConflictError(NOT_DELETED);
  }
  return null;
};

/** What the update writes, and the `deletedAt` the note must still have. */
const writeFor = (change: Change, actorPersonId: string) => {
  const now = new Date();
  return {
    // A concurrent change between the read and the write finds no row here.
    where: { deletedAt: change === "delete" ? null : { not: null } },
    data: {
      deletedAt: change === "delete" ? now : null,
      lastEditedById: actorPersonId,
      lastEditedAt: now,
    },
  };
};

const lostRace = (change: Change): ConflictError =>
  new ConflictError(change === "delete" ? ALREADY_DELETED : NOT_DELETED);

// --- animal notes -----------------------------------------------------------

const changeAnimalNote = async (
  tx: TransactionClient,
  change: Change,
  noteId: string,
  animalId: string,
  actorPersonId: string,
): Promise<void> => {
  // The activity-log write reads the owning animal and the category off the
  // note itself, not off the request.
  const note = await tx.animalNote.findFirst({
    where: { id: noteId, animalId },
    select: { animalId: true, category: true, deletedAt: true },
  });
  if (!note) throw new NotFoundError(NOT_FOUND);
  const refusal = refusalFor(change, note);
  if (refusal) throw refusal;

  const { where, data } = writeFor(change, actorPersonId);
  const { count } = await tx.animalNote.updateMany({
    where: { id: noteId, animalId, ...where },
    data,
  });
  if (count !== 1) throw lostRace(change);

  await recordNoteMutation(tx, {
    targetType: NoteTargetType.ANIMAL,
    targetId: noteId,
    action: ACTION_BY_CHANGE[change],
    actorId: actorPersonId,
    animalId: note.animalId,
    categoryLabel: formatSingleEnumOption(note.category),
  });
};

export const softDeleteAnimalNote = (
  tx: TransactionClient,
  noteId: string,
  animalId: string,
  actorPersonId: string,
) => changeAnimalNote(tx, "delete", noteId, animalId, actorPersonId);

export const restoreAnimalNoteRow = (
  tx: TransactionClient,
  noteId: string,
  animalId: string,
  actorPersonId: string,
) => changeAnimalNote(tx, "restore", noteId, animalId, actorPersonId);

// --- person notes -----------------------------------------------------------

const changePersonNote = async (
  tx: TransactionClient,
  change: Change,
  noteId: string,
  personId: string,
  actorPersonId: string,
): Promise<void> => {
  const note = await tx.personNote.findFirst({
    where: { id: noteId, personId },
    select: { deletedAt: true },
  });
  if (!note) throw new NotFoundError(NOT_FOUND);
  const refusal = refusalFor(change, note);
  if (refusal) throw refusal;

  const { where, data } = writeFor(change, actorPersonId);
  const { count } = await tx.personNote.updateMany({
    where: { id: noteId, personId, ...where },
    data,
  });
  if (count !== 1) throw lostRace(change);

  await recordNoteMutation(tx, {
    targetType: NoteTargetType.PERSON,
    targetId: noteId,
    action: ACTION_BY_CHANGE[change],
    actorId: actorPersonId,
  });
};

export const softDeletePersonNote = (
  tx: TransactionClient,
  noteId: string,
  personId: string,
  actorPersonId: string,
) => changePersonNote(tx, "delete", noteId, personId, actorPersonId);

export const restorePersonNoteRow = (
  tx: TransactionClient,
  noteId: string,
  personId: string,
  actorPersonId: string,
) => changePersonNote(tx, "restore", noteId, personId, actorPersonId);

// --- partner notes ----------------------------------------------------------

const changePartnerNote = async (
  tx: TransactionClient,
  change: Change,
  noteId: string,
  partnerId: string,
  actorPersonId: string,
): Promise<void> => {
  const note = await tx.partnerNote.findFirst({
    where: { id: noteId, partnerId },
    select: { deletedAt: true },
  });
  if (!note) throw new NotFoundError(NOT_FOUND);
  const refusal = refusalFor(change, note);
  if (refusal) throw refusal;

  const { where, data } = writeFor(change, actorPersonId);
  const { count } = await tx.partnerNote.updateMany({
    where: { id: noteId, partnerId, ...where },
    data,
  });
  if (count !== 1) throw lostRace(change);

  await recordNoteMutation(tx, {
    targetType: NoteTargetType.PARTNER,
    targetId: noteId,
    action: ACTION_BY_CHANGE[change],
    actorId: actorPersonId,
  });
};

export const softDeletePartnerNote = (
  tx: TransactionClient,
  noteId: string,
  partnerId: string,
  actorPersonId: string,
) => changePartnerNote(tx, "delete", noteId, partnerId, actorPersonId);

export const restorePartnerNoteRow = (
  tx: TransactionClient,
  noteId: string,
  partnerId: string,
  actorPersonId: string,
) => changePartnerNote(tx, "restore", noteId, partnerId, actorPersonId);
