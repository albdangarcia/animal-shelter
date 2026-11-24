import type { TransactionClient } from "@/app/lib/prisma";
import {
  AnimalActivityType,
  AnimalListingStatus,
  TaskStatus,
  type OutcomeType,
} from "@/prisma/generated/enums";
import { ConflictError } from "@/app/lib/utils/errors";
import { describeOutcomeType } from "@/app/lib/utils/outcome-types";

/**
 * What happens to an animal's tasks when it leaves the shelter, and when it
 * turns out it never did.
 *
 * An outcome that archives the animal (recording one, or converting a
 * foster-to-adopt placement) cancels every task still to do on it, in the
 * same transaction. Each task keeps the outcome that canceled it and the
 * status it had, and reversing that outcome puts the status back. A re-intake
 * does not: the animal really left, and what was planned for it then is
 * stale.
 *
 * While the animal is archived nothing can open a task on it again: a new
 * task, or a status change to one still to do, is refused. Without that, the
 * tasks would be stranded again, since the dashboard's "Needs attention
 * today" leaves out animals that have left, and nothing would ever close
 * them.
 *
 * Has no `next/*` and no auth imports, so a plain `node:test` can drive it.
 * Every caller holds `lockAnimal` for the animal, so an outcome and a task
 * write on the same animal can't pass each other.
 */

/**
 * A task someone still has to do, or might: on hold is paused, not finished.
 * Done, skipped, canceled and trashed tasks are settled.
 */
export const TASK_STATUSES_STILL_TO_DO: readonly TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.ON_HOLD,
];

export const isStillToDo = (status: TaskStatus) =>
  TASK_STATUSES_STILL_TO_DO.includes(status);

/**
 * What a status change staff make does to the task's link to the outcome that
 * canceled it. Trashing a canceled task, and taking it back out of the trash,
 * keep the link: it is still the task the outcome canceled, and a reversal
 * reopens it once it is canceled again. Any other status is a decision about
 * the task, so the link goes and a reversal leaves the task as staff set it.
 */
export const outcomeLinkAfterStatusChange = (status: TaskStatus) =>
  status === TaskStatus.CANCELED || status === TaskStatus.DELETED
    ? {}
    : { canceledByOutcomeId: null, statusBeforeOutcome: null };

export const ANIMAL_LEFT_TASK_MESSAGE =
  "This animal has left the shelter, so it can't have open tasks. To add or reopen one, re-intake the animal first.";

/**
 * Refuses a task still to do on an archived animal: a new one, or one moved
 * back to To Do, In Progress or On Hold. Settling a task (done, skipped,
 * canceled, trashed) is always allowed. The caller holds the animal's lock.
 */
export const assertAnimalCanHaveOpenTask = async (
  tx: TransactionClient,
  animalId: string,
  status: TaskStatus,
): Promise<void> => {
  if (!isStillToDo(status)) return;
  const animal = await tx.animal.findUnique({
    where: { id: animalId },
    select: { listingStatus: true },
  });
  if (animal?.listingStatus === AnimalListingStatus.ARCHIVED) {
    throw new ConflictError(ANIMAL_LEFT_TASK_MESSAGE);
  }
};

const tasksSentence = (count: number, verb: string) =>
  count === 1
    ? `1 open task was ${verb}.`
    : `${count} open tasks were ${verb}.`;

/** "2 open tasks were canceled.", or null when there were none. */
export const describeCanceledTasks = (count: number) =>
  count > 0 ? tasksSentence(count, "canceled") : null;

/** A success message, with "2 open tasks were canceled." when any were. */
export const withCanceledTasks = (message: string, count: number) => {
  const sentence = describeCanceledTasks(count);
  return sentence ? `${message} ${sentence}` : message;
};

/** "1 task the outcome canceled was reopened.", or null for none. */
export const describeReopenedTasks = (count: number) =>
  count === 0
    ? null
    : count === 1
      ? "1 task the outcome canceled was reopened."
      : `${count} tasks the outcome canceled were reopened.`;

/** How many tasks recording an outcome now would cancel. */
export const countTasksStillToDo = (
  db: Pick<TransactionClient, "task">,
  animalId: string,
) =>
  db.task.count({
    where: { animalId, status: { in: [...TASK_STATUSES_STILL_TO_DO] } },
  });

// The feed orders by time alone, newest first, and shows these rows above the
// outcome or reversal that caused them only if they are later. Two rows
// written back to back can share a millisecond, so they are stamped at least
// a millisecond after it.
const stampAfter = (after: Date) =>
  new Date(Math.max(Date.now(), after.getTime() + 1));

/**
 * Cancels every task still to do on the animal the outcome archived, keeping
 * the outcome and each task's status for a reversal. One activity row per
 * task. Returns how many were canceled.
 *
 * Called after the archive, behind the animal's lock.
 */
export const cancelOpenTasksForOutcome = async (
  tx: TransactionClient,
  params: {
    animalId: string;
    outcomeId: string;
    outcomeType: OutcomeType;
    actorId: string;
    /** When the outcome's own activity row was stamped. */
    after: Date;
    /**
     * Stamps the rows at this instant instead. Only the seed passes it, to
     * date them with the outcome it backdates.
     */
    at?: Date;
  },
): Promise<number> => {
  const { animalId, outcomeId, outcomeType, actorId, after, at } = params;

  const tasks = await tx.task.findMany({
    where: { animalId, status: { in: [...TASK_STATUSES_STILL_TO_DO] } },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  if (tasks.length === 0) return 0;

  for (const task of tasks) {
    await tx.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.CANCELED,
        canceledByOutcomeId: outcomeId,
        statusBeforeOutcome: task.status,
      },
    });
  }

  const changedAt = at ?? stampAfter(after);
  await tx.animalActivityLog.createMany({
    data: tasks.map((task) => ({
      animalId,
      activityType: AnimalActivityType.TASK_STATUS_CHANGED,
      changedById: actorId,
      changedAt,
      changeSummary: `Task "${task.title}" status changed from ${task.status} to ${TaskStatus.CANCELED}: the animal left (${describeOutcomeType(outcomeType)}).`,
    })),
  });

  return tasks.length;
};

/**
 * Puts back the tasks a reversed outcome canceled, each to the status it had.
 * A task whose status anyone changed since is no longer linked to the outcome,
 * so it is left as they set it. One activity row per task. Returns how many
 * were reopened.
 *
 * Only for a reversal of the outcome that archived the animal: once a
 * re-intake has moved the animal on, the reversal leaves its tasks alone, as
 * it leaves its listing.
 */
export const reopenTasksCanceledByOutcome = async (
  tx: TransactionClient,
  params: {
    animalId: string;
    outcomeId: string;
    actorId: string;
    /** When the reversal's own activity row was stamped. */
    after: Date;
  },
): Promise<number> => {
  const { animalId, outcomeId, actorId, after } = params;

  const tasks = await tx.task.findMany({
    where: {
      animalId,
      canceledByOutcomeId: outcomeId,
      status: TaskStatus.CANCELED,
    },
    select: { id: true, title: true, statusBeforeOutcome: true },
    orderBy: { createdAt: "asc" },
  });
  if (tasks.length === 0) return 0;

  const reopened = tasks.map((task) => ({
    ...task,
    status: task.statusBeforeOutcome ?? TaskStatus.TODO,
  }));
  for (const task of reopened) {
    await tx.task.update({
      where: { id: task.id },
      data: {
        status: task.status,
        canceledByOutcomeId: null,
        statusBeforeOutcome: null,
      },
    });
  }

  const changedAt = stampAfter(after);
  await tx.animalActivityLog.createMany({
    data: reopened.map((task) => ({
      animalId,
      activityType: AnimalActivityType.TASK_STATUS_CHANGED,
      changedById: actorId,
      changedAt,
      changeSummary: `Task "${task.title}" status changed from ${TaskStatus.CANCELED} to ${task.status}: the outcome that canceled it was reversed.`,
    })),
  });

  return reopened.length;
};
