import type { TransactionClient } from "@/app/lib/prisma";
import type { TaskStatus } from "@/prisma/generated/enums";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  isTaskStatusStale,
  STALE_UNDO_MESSAGE,
  type TaskStatusSnapshot,
} from "@/app/lib/data/ai-activity";
import { applyTaskStatusChange } from "@/app/lib/tasks/apply-task-status-change";
import { NotFoundError, PreconditionFailedError } from "@/app/lib/utils/errors";

/**
 * Puts a task back to the status it had before the assistant changed it,
 * inside the caller's `prisma.$transaction`, refusing when anything changed
 * the task since (`isTaskStatusStale`).
 *
 * The animal's lock is taken before the task's status is read, as every task
 * status write takes it. Read first, a status an outcome was cancelling at
 * that moment would pass the check, and the undo would then write over the
 * cancel once the outcome committed.
 *
 * No `next/*` and no auth imports, so a plain `node:test` can drive it; the
 * undo action wraps it.
 */
export const applyAiTaskUndo = async (
  tx: TransactionClient,
  params: {
    taskId: string;
    restoreTo: TaskStatus;
    /** The status the assistant left the task in. */
    leftAt: TaskStatusSnapshot;
    actorId: string;
  },
) => {
  const { taskId, restoreTo, leftAt, actorId } = params;

  // A task's animal never changes, so this read needs no lock.
  const located = await tx.task.findUnique({
    where: { id: taskId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("The task this change applied to no longer exists.");
  }
  await lockAnimal(tx, located.animalId);

  const task = await tx.task.findUnique({
    where: { id: taskId },
    select: { status: true },
  });
  if (!task) {
    throw new NotFoundError("The task this change applied to no longer exists.");
  }
  if (isTaskStatusStale(task.status, leftAt)) {
    throw new PreconditionFailedError(STALE_UNDO_MESSAGE);
  }
  return applyTaskStatusChange(tx, {
    taskId,
    status: restoreTo,
    changedById: actorId,
  });
};
