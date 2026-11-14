import type { TransactionClient } from "@/app/lib/prisma";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { calendarDay, type CalendarDay } from "@/app/lib/utils/shelter-day";
import { AnimalListingStatus } from "@/prisma/generated/enums";
import { findArchivingOutcome } from "@/app/lib/services/archiving-outcome";
import {
  evaluateListingAgreement,
  evaluateOutcomeReversal,
  evaluatePlacementBounds,
  evaluateTimelineChange,
  refuseFutureDay,
  type ListingState,
  type TimelineChange,
  type TimelineEvent,
} from "./animal-timeline";

export type { TimelineChange } from "./animal-timeline";

/**
 * The gate every writer of an intake or outcome day passes before writing it.
 * Returns null when the change is accepted, or the refusal to show staff,
 * naming the event the day would cross. The day must keep the timeline in
 * order (`evaluateTimelineChange`), and keep it agreeing with the animal's
 * listing (`evaluateListingAgreement`): an archived animal's timeline ends on
 * the outcome that archived it.
 *
 * Must be called after `lockAnimal(tx, animalId)`, in the transaction that
 * then writes the change. The decision rests on the animal's other intakes and
 * outcomes, and recording or reversing an outcome, or re-intaking the animal,
 * holds that same row while it writes one. Without the lock, an event committed
 * between this read and the write would be missed, and the pair could leave the
 * timeline broken even though each was checked. Reading through `tx` behind the lock means the
 * events judged here are still the animal's when the change is written.
 */
export async function checkTimelineChange(
  tx: TransactionClient,
  animalId: string,
  change: TimelineChange,
): Promise<string | null> {
  const events = await readTimelineEvents(tx, animalId);
  return (
    evaluateTimelineChange(events, change, await getShelterToday()) ??
    evaluateListingAgreement(events, change, await readListingState(tx, animalId))
  );
}

/**
 * The gate a reversal passes before voiding an outcome: whether the animal's
 * listing still agrees with its timeline once the outcome is gone. Returns
 * null when it does, or the refusal to show staff
 * (`evaluateOutcomeReversal` has the rule).
 *
 * Unlike `checkTimelineChange`, it does not judge the timeline's order: a
 * reversal that leaves two intakes in a row is the truthful record. Must be
 * called after `lockAnimal(tx, animalId)`, in the transaction that then
 * reverses the outcome, and while the outcome is still live.
 */
export async function checkOutcomeReversal(
  tx: TransactionClient,
  animalId: string,
  outcomeId: string,
): Promise<string | null> {
  return evaluateOutcomeReversal(
    await readTimelineEvents(tx, animalId),
    outcomeId,
    await readListingState(tx, animalId),
  );
}

// Whether the animal is archived, and by which outcome: the one
// `findArchivingOutcome` names, as a reversal and a re-intake read it too.
// An archived animal with no live outcome is still archived, by none.
const readListingState = async (
  tx: TransactionClient,
  animalId: string,
): Promise<ListingState> => {
  const animal = await tx.animal.findUnique({
    where: { id: animalId },
    select: { listingStatus: true },
  });
  if (animal?.listingStatus !== AnimalListingStatus.ARCHIVED) {
    return { archived: false, archivingOutcomeRef: null };
  }
  const archiving = await findArchivingOutcome(tx, animalId);
  return { archived: true, archivingOutcomeRef: archiving?.id ?? null };
};

/**
 * The second gate for a change to an intake or outcome day: whether it keeps
 * every foster placement of the animal inside a stay. Returns null when it
 * does, or the refusal to show staff, naming the placement
 * (`evaluatePlacementBounds` has the rule).
 *
 * Called after `checkTimelineChange` has accepted the same change, behind the
 * same `lockAnimal`, in the transaction that then writes it. Returning or
 * converting a placement takes that lock, and making one writes the locked
 * row, so the placements read here are still the animal's when the change is
 * written.
 */
export async function checkPlacementsInsideStay(
  tx: TransactionClient,
  animalId: string,
  change: TimelineChange,
): Promise<string | null> {
  const placements = await tx.fosterPlacement.findMany({
    where: { animalId },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      outcomeId: true,
      fosterProfile: { select: { person: { select: { name: true } } } },
    },
  });
  if (placements.length === 0) return null;

  return evaluatePlacementBounds(
    await readTimelineEvents(tx, animalId),
    placements.map((placement) => ({
      ref: placement.id,
      startDate: calendarDay(placement.startDate),
      endDate:
        placement.endDate === null ? null : calendarDay(placement.endDate),
      outcomeId: placement.outcomeId,
      fosterName: placement.fosterProfile.person.name,
    })),
    change,
  );
}

// The animal's intakes and live outcomes, as both gates read them.
const readTimelineEvents = async (
  tx: TransactionClient,
  animalId: string,
): Promise<TimelineEvent[]> => {
  const intakes = await tx.intake.findMany({
    where: { animalId },
    select: { id: true, intakeDate: true },
  });
  // A reversed outcome records a departure that never happened, so it has no
  // place on the timeline.
  const outcomes = await tx.outcome.findMany({
    where: { animalId, reversedAt: null },
    select: { id: true, outcomeDate: true },
  });

  return [
    ...intakes.map((intake) => ({
      kind: "intake" as const,
      date: calendarDay(intake.intakeDate),
      ref: intake.id,
    })),
    ...outcomes.map((outcome) => ({
      kind: "outcome" as const,
      date: calendarDay(outcome.outcomeDate),
      ref: outcome.id,
    })),
  ];
};

/**
 * The future-day half of `checkTimelineChange`, for the one writer with no
 * timeline to check against: creating an animal writes its first intake, and
 * no order can be broken by it. Returns the refusal, or null.
 */
export async function checkFirstIntakeDay(
  day: CalendarDay,
): Promise<string | null> {
  return refuseFutureDay("intake", day, await getShelterToday());
}
