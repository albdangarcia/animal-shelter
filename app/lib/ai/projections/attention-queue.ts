import type {
  AnimalHealthStatus,
  TaskPriority,
} from "@/prisma/generated/enums";
import type { AttentionQueueItem } from "@/app/lib/data/animals/attention-queue.data";

export type AttentionReasonView =
  | {
      kind: "TASK_DUE";
      taskId: string;
      title: string;
      dueDate: string;
      priority: TaskPriority;
    }
  | { kind: "UNTASKED_ACUTE_HEALTH"; healthStatus: AnimalHealthStatus }
  | {
      kind: "FOSTER_OVERDUE";
      placementId: string;
      expectedEndDate: string;
      fosterName: string;
    };

export type AttentionQueueEntry = {
  animalId: string;
  name: string;
  species: string;
  currentUnit: string | null;
  reasons: AttentionReasonView[];
};

export function toAttentionQueueView(
  items: AttentionQueueItem[],
): AttentionQueueEntry[] {
  return items.map((item) => ({
    animalId: item.animalId,
    name: item.name,
    species: item.species,
    currentUnit: item.currentUnit,
    reasons: item.reasons.map(toReasonView),
  }));
}

function toReasonView(
  reason: AttentionQueueItem["reasons"][number],
): AttentionReasonView {
  switch (reason.kind) {
    case "TASK_DUE":
      return {
        kind: "TASK_DUE",
        taskId: reason.taskId,
        title: reason.title,
        dueDate: reason.dueDate.toISOString(),
        priority: reason.priority,
      };
    case "UNTASKED_ACUTE_HEALTH":
      return {
        kind: "UNTASKED_ACUTE_HEALTH",
        healthStatus: reason.healthStatus,
      };
    case "FOSTER_OVERDUE":
      return {
        kind: "FOSTER_OVERDUE",
        placementId: reason.placementId,
        expectedEndDate: reason.expectedEndDate.toISOString(),
        fosterName: reason.fosterName,
      };
  }
}
