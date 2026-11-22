import type { TransactionClient } from "@/app/lib/prisma";
import { AnimalActivityType, type TaskStatus } from "@/prisma/generated/enums";
import { NotFoundError } from "@/app/lib/utils/errors";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import {
  assertAnimalCanHaveOpenTask,
  outcomeLinkAfterStatusChange,
} from "@/app/lib/services/outcome-tasks";

/**
 * Read prior status inside the transaction, update, and write a
 * `TASK_STATUS_CHANGED` activity entry **only when the value actually changed**
 * (mirrors `_updateAnimal`). Runs inside the caller's `prisma.$transaction`:
 *
 * - server action → this + `revalidatePath`
 * - AI write     → this + an `AiActionLog` row, no `revalidatePath`
 *
 * A task must never change without its `AnimalActivityLog` entry, so the write
 * and the log are one transaction. It is the caller's job to open it.
 *
 * `changed: false` is a real outcome, not an error: the caller skips whatever
 * side-effects (revalidation, `AiActionLog`) a no-op should not produce.
 *
 * Behind the animal's lock, a task of an animal that has left can't be moved
 * back to a status still to do (`assertAnimalCanHaveOpenTask`): an outcome
 * canceled it, and the dashboard would never show it again. A change other
 * than trashing or restoring a canceled task also unlinks it from the outcome
 * that canceled it (`outcomeLinkAfterStatusChange`), so reversing that outcome
 * leaves what staff did alone.
 */
export async function applyTaskStatusChange(
  tx: TransactionClient,
  params: { taskId: string; status: TaskStatus; changedById: string },
): Promise<{
  animalId: string;
  previousStatus: TaskStatus;
  title: string;
  changed: boolean;
}> {
  const { taskId, status, changedById } = params;

  // A task's animal never changes, so this read needs no lock.
  const located = await tx.task.findUnique({
    where: { id: taskId },
    select: { animalId: true },
  });
  if (!located) {
    throw new NotFoundError("Task not found.");
  }
  await lockAnimal(tx, located.animalId);

  const existing = await tx.task.findUnique({
    where: { id: taskId },
    select: { status: true, title: true },
  });

  if (!existing) {
    throw new NotFoundError("Task not found.");
  }

  const changed = existing.status !== status;
  if (changed) {
    await assertAnimalCanHaveOpenTask(tx, located.animalId, status);
  }

  const task = await tx.task.update({
    where: { id: taskId },
    data: changed
      ? { status, ...outcomeLinkAfterStatusChange(status) }
      : { status },
    select: { animalId: true },
  });

  if (changed) {
    await tx.animalActivityLog.create({
      data: {
        animalId: task.animalId,
        activityType: AnimalActivityType.TASK_STATUS_CHANGED,
        changedById,
        changeSummary: `Task "${existing.title}" status changed from ${existing.status} to ${status}.`,
      },
    });
  }

  return {
    animalId: task.animalId,
    previousStatus: existing.status,
    title: existing.title,
    changed,
  };
}
