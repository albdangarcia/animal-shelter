// When a medical entry form offers to schedule the next dose, and what of
// that offer counts as a change to the form. Pure, so the unit tests pin both.

import { MedicalEntrySource } from "@/prisma/generated/enums";

/** What the offer needs to know about an item the form can pick. */
export interface NextDoseCandidate {
  id: string;
  repeatIntervalDays: number | null;
  /** The animal's open scheduled entries for the item. */
  scheduledEntryIds: string[];
}

/** What the offer needs to know about the form's state. */
export interface NextDoseState {
  itemId: string;
  source: MedicalEntrySource;
  completedDate: string | null;
  dateUnknown: boolean;
}

/**
 * The item whose next dose the form offers to schedule, or null.
 *
 * - The animal must be in care, since nothing new is scheduled for one that
 *   has left.
 * - The item must repeat, and be among `items`, the ones still pickable for
 *   new entries.
 * - The day given must be known.
 * - No scheduled entry for the item may be open besides the one being
 *   recorded (`recordingEntryId`): then the next one is already planned.
 * - Not for care given before intake, which is history brought in with the
 *   animal, not care this stay plans from.
 */
export const nextDoseItem = <TItem extends NextDoseCandidate>(
  state: NextDoseState,
  options: { inCare: boolean; items: TItem[] },
  recordingEntryId: string | undefined,
): TItem | null => {
  if (!options.inCare) return null;
  const item = options.items.find((candidate) => candidate.id === state.itemId);
  if (!item || item.repeatIntervalDays === null) return null;
  if (
    state.source === MedicalEntrySource.BEFORE_INTAKE ||
    state.dateUnknown ||
    !state.completedDate
  ) {
    return null;
  }
  if (item.scheduledEntryIds.some((id) => id !== recordingEntryId)) return null;
  return item;
};

/**
 * The form's state as its unsaved-changes check compares it. The next dose's
 * fields count only while the form offers it (`offered`), and its day only
 * while the box is ticked: a day suggested for an item since left behind
 * isn't a change anyone made.
 */
export const withoutInactiveNextDose = <
  TState extends { scheduleNextOn: boolean; scheduleNext: unknown },
>(
  state: TState,
  offered: boolean,
): Partial<TState> => {
  const { scheduleNextOn, scheduleNext: _scheduleNext, ...rest } = state;
  if (!offered) return rest as Partial<TState>;
  return (
    scheduleNextOn ? state : { ...rest, scheduleNextOn }
  ) as Partial<TState>;
};
