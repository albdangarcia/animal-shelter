import type { TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  NoteEventAction,
  NoteTargetType,
} from "@/prisma/generated/enums";

/**
 * Shared audit trail for note mutations, called inside the caller's
 * `prisma.$transaction`:
 *
 * - server action → this + `revalidatePath` (outside the helper)
 * - seed          → this + its own `tx`
 * - `node:test`   → this + assertions on the resulting rows
 *
 * This module deliberately has **no `next/*` and no auth imports** — that is what
 * lets the seed and `node:test` call it. The one dependency on
 * generated Prisma code is a type-only import, erased at build.
 *
 * Every note mutation writes one `NoteEvent`. Animal note mutations additionally
 * write an `AnimalActivityLog` row (the journey feed), so `NOTE_ADDED` /
 * `NOTE_EDITED` / `NOTE_DELETED` / `NOTE_RESTORED` show up there.
 */

const ACTIVITY_TYPE_BY_ACTION: Record<NoteEventAction, AnimalActivityType> = {
  [NoteEventAction.CREATED]: AnimalActivityType.NOTE_ADDED,
  [NoteEventAction.EDITED]: AnimalActivityType.NOTE_EDITED,
  [NoteEventAction.DELETED]: AnimalActivityType.NOTE_DELETED,
  [NoteEventAction.RESTORED]: AnimalActivityType.NOTE_RESTORED,
};

export interface RecordNoteMutationParams {
  targetType: NoteTargetType;
  /** The note's id. `NoteEvent` has no FK to the note (polymorphic). */
  targetId: string;
  action: NoteEventAction;
  /** Always the acting session user's `personId`. Required FK on both rows. */
  actorId: string;
  /** Animal notes only — the owning animal, read off the note, not trusted from
   *  the caller's argument. Drives the `AnimalActivityLog` write. */
  animalId?: string;
  /** Animal notes only — the note's `NoteCategory` formatted for display, used as
   *  the `AnimalActivityLog.changeSummary` (feeds the "Show details" expander). */
  categoryLabel?: string;
}

export async function recordNoteMutation(
  tx: TransactionClient,
  params: RecordNoteMutationParams,
): Promise<void> {
  const { targetType, targetId, action, actorId, animalId, categoryLabel } =
    params;

  await tx.noteEvent.create({
    data: { targetType, targetId, action, actorId },
  });

  if (targetType !== NoteTargetType.ANIMAL) return;

  if (!animalId) {
    throw new Error(
      "recordNoteMutation: animalId is required for ANIMAL note events.",
    );
  }

  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: ACTIVITY_TYPE_BY_ACTION[action],
      changedById: actorId,
      changeSummary: categoryLabel ?? null,
    },
  });
}

/**
 * no-op edit guard, as a pure predicate so it can be unit-tested without a
 * database. Person/partner notes have no `category`; pass `undefined` for both
 * sides and only `content` is compared.
 */
export function isNoteEditNoOp(
  current: { content: string; category?: string | null },
  next: { content: string; category?: string | null },
): boolean {
  return (
    current.content === next.content &&
    (current.category ?? null) === (next.category ?? null)
  );
}

/** The exact toast the dialog surfaces on a no-op save */
export const NO_OP_EDIT_MESSAGE = "No changes to save.";
