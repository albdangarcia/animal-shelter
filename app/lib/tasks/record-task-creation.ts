import type { TransactionClient } from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { AnimalActivityType, TaskStatus } from "@/prisma/generated/enums";
import { lockAnimal } from "@/app/lib/data/application-status.data";
import { assertAnimalCanHaveOpenTask } from "@/app/lib/services/outcome-tasks";

export type TaskCreationData = Omit<
  Prisma.TaskUncheckedCreateInput,
  "animalId" | "createdById" | "canceledByOutcomeId" | "statusBeforeOutcome"
>;

/**
 * Creates a task on an animal with its `TASK_CREATED` activity row, inside the
 * caller's `prisma.$transaction`.
 *
 * Behind the animal's lock, an animal that has left the shelter is refused a
 * task still to do (`assertAnimalCanHaveOpenTask`). Recording an outcome takes
 * the same lock, so a task created while the animal is leaving is either
 * canceled by the outcome or refused here.
 *
 * No `next/*` and no auth imports, so a plain `node:test` can drive it; the
 * server action wraps it.
 */
export const recordTaskCreation = async (
  tx: TransactionClient,
  params: { animalId: string; createdById: string; data: TaskCreationData },
): Promise<{ id: string }> => {
  const { animalId, createdById, data } = params;

  await lockAnimal(tx, animalId);
  await assertAnimalCanHaveOpenTask(
    tx,
    animalId,
    data.status ?? TaskStatus.TODO,
  );

  const task = await tx.task.create({
    data: { ...data, animalId, createdById },
    select: { id: true },
  });

  await tx.animalActivityLog.create({
    data: {
      animalId,
      activityType: AnimalActivityType.TASK_CREATED,
      changedById: createdById,
      changeSummary: `Task "${data.title}" was created.`,
    },
  });

  return task;
};
