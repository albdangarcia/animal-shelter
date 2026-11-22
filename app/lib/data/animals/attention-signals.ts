// The attention queue's five signals, read from the database: "what needs
// attention today". No auth or `next/*` imports, so database tests can call
// them. Two readers merge them:
//   - `buildAttentionQueue` (`attention-queue.ts`) into the AI's capped,
//     per-animal worklist;
//   - `summarizeAttention` (`attention-summary.ts`) into the dashboard's
//     uncapped counts per reason.
// Both read these same rows, so the dashboard's counts and the AI's queue
// cannot disagree on what is due.
//
// Signals:
//   1. Task overdue or due today (status TODO/IN_PROGRESS, dueDate <= today)
//   2. Medication dose slots missed yesterday or today: a slot an order
//      expects whose window has ended on the shelter's clock with no dose
//      recorded, read by `findMissedDosesForQueue`. Refused and not given
//      account for their slot.
//   3. Scheduled medical care overdue or due today (status SCHEDULED, not
//      voided, dueDate <= today), read by `findMedicalDueForQueue`
//   4. An open care episode with nothing planned: no open task, no
//      scheduled care and no medication order running, read by
//      `findUnplannedCareForQueue`
//   5. Open foster placement past its expectedEndDate
//
// Queue-wide precondition: ARCHIVED animals (adopted / transferred / deceased)
// are excluded from every signal. Their state is frozen history — an item on
// one can never clear, which is exactly what this queue is defined against. A
// stray overdue task on an adopted animal is real data hygiene, but it is not
// animal care and does not belong here.

import type prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { TaskStatus } from "@/prisma/generated/enums";
import {
  calendarDay,
  type CalendarDay,
  type ShelterClock,
} from "@/app/lib/utils/shelter-day";
import type { DoseSlotEnds } from "@/app/lib/utils/medication-slots";
import { findMedicalDueForQueue } from "../medical-due";
import { findUnplannedCareForQueue } from "../care-episodes";
import { findMissedDosesForQueue } from "../medication-doses";
import { animalNotArchived } from "./not-archived";
import {
  attentionUnitLabel,
  type AttentionAnimal,
  type AttentionSignals,
} from "./attention-queue";

// The root client only, never a transaction's: the reads select sibling
// relations, which Prisma fetches at once, and a transaction has one
// connection to run them on.
type Db = typeof prisma;

export type { AttentionSignals };

const OPEN_TASK_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

// Flattened animal-identity select, shared by the task and foster queries.
// The medical and care queries have their own, in their modules.
const attentionAnimalSelect = {
  id: true,
  name: true,
  species: { select: { name: true } },
  currentUnit: {
    select: { name: true, location: { select: { name: true } } },
  },
} satisfies Prisma.AnimalSelect;

type AttentionAnimalRow = Prisma.AnimalGetPayload<{
  select: typeof attentionAnimalSelect;
}>;

const toAttentionAnimal = (animal: AttentionAnimalRow): AttentionAnimal => ({
  id: animal.id,
  name: animal.name,
  species: animal.species.name,
  currentUnit: attentionUnitLabel(animal.currentUnit),
});

/**
 * Every row of the five signals on the shelter's `today` and `clock`.
 *
 * Every deadline column holds a calendar day, so each boundary is one day
 * compared as a plain string — resolved on the shelter's calendar, which is
 * the only place "today" means anything here. Signals 1 and 3 count anything
 * due at any point today, so `<= today`. Signal 5 is strictly before today,
 * so a placement expected to end today is not yet overdue. Signal 2 reads the
 * clock too, to tell which of today's slots have ended: the caller takes both
 * from one reading, so they agree on the day.
 */
export const findAttentionSignals = async (
  db: Db,
  {
    today,
    clock,
    doseSlotEnds,
  }: { today: CalendarDay; clock: ShelterClock; doseSlotEnds: DoseSlotEnds },
): Promise<AttentionSignals> => {
  const [tasksDue, dosesMissed, medicalDue, careUnplanned, fostersOverdue] =
    await Promise.all([
      // Signal 1. A null dueDate never satisfies `lte`, so undated backlog
      // tasks are excluded without an explicit filter.
      db.task.findMany({
        where: {
          status: { in: OPEN_TASK_STATUSES },
          dueDate: { lte: today },
          animal: animalNotArchived,
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          animal: { select: attentionAnimalSelect },
        },
      }),
      // Signal 2. Archived animals are left out there too.
      findMissedDosesForQueue(db, clock, doseSlotEnds),
      // Signal 3. Archived animals are left out there too.
      findMedicalDueForQueue(db, today),
      // Signal 4. Under care AND nothing planned — an animal that needs care
      // and nobody has planned anything. Creating a task, scheduling care or
      // ordering a medication clears it. Archived animals are left out there
      // too.
      findUnplannedCareForQueue(db, today),
      // Signal 5. Open placement (endDate == null) past its expected end.
      // One open placement per animal is an action-layer rule, not a DB
      // constraint — do not assume at most one row per animal.
      db.fosterPlacement.findMany({
        where: {
          endDate: null,
          expectedEndDate: { lt: today },
          animal: animalNotArchived,
        },
        select: {
          id: true,
          expectedEndDate: true,
          animal: { select: attentionAnimalSelect },
          fosterProfile: {
            select: { person: { select: { name: true } } },
          },
        },
      }),
    ]);

  return {
    tasksDue: tasksDue.map((task) => ({
      animal: toAttentionAnimal(task.animal),
      taskId: task.id,
      title: task.title,
      // `lte: today` guarantees a non-null dueDate here.
      dueDate: calendarDay(task.dueDate!),
      priority: task.priority,
    })),
    dosesMissed,
    medicalDue,
    careUnplanned,
    fostersOverdue: fostersOverdue.map((placement) => ({
      animal: toAttentionAnimal(placement.animal),
      placementId: placement.id,
      expectedEndDate: calendarDay(placement.expectedEndDate!),
      fosterName: placement.fosterProfile.person.name,
    })),
  };
};
