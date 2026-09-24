import type { TransactionClient } from "@/app/lib/prisma";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import {
  evaluateTimelineChange,
  type TimelineChange,
  type TimelineEvent,
} from "./animal-timeline";

export type { TimelineChange } from "./animal-timeline";

/**
 * The gate every writer of an intake or outcome day passes before writing it.
 * Returns null when the change is accepted, or the refusal to show staff,
 * naming the event the day would cross (`evaluateTimelineChange` has the
 * rules).
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

  const events: TimelineEvent[] = [
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

  return evaluateTimelineChange(events, change, await getShelterToday());
}
