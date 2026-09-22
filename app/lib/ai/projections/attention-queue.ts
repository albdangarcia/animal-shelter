import type {
  AnimalHealthStatus,
  TaskPriority,
} from "@/prisma/generated/enums";
import type { AttentionQueueItem } from "@/app/lib/data/animals/attention-queue.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

export type AttentionReasonView =
  | {
      kind: "TASK_DUE";
      taskId: string;
      title: string;
      dueDate: string;
      /**
       * Stated, not implied.
       *
       * The queue mixes tasks that are overdue with tasks due today, and
       * overdue is the more urgent of the two. Left to infer it from `dueDate`
       * against the day in the system prompt, a model gets it wrong often
       * enough to matter: observed answers have demoted five overdue tasks to a
       * footnote as "not due today", and have dropped them from the answer
       * entirely. Date arithmetic is cheap here and unreliable there, so the
       * projection does it. This is the projection layer earning its keep
       * — its job is to be the contract with the model, not a passthrough.
       */
      overdue: boolean;
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

/**
 * `today` is a parameter rather than resolved inside, so "is this overdue" is a
 * pure function of its inputs and can be tested without freezing a clock. It is
 * also the only honest way to get it: which day it is depends on the shelter's
 * timezone, and the caller is the one holding that.
 */
export function toAttentionQueueView(
  items: AttentionQueueItem[],
  today: CalendarDay,
): AttentionQueueEntry[] {
  return items.map((item) => ({
    animalId: item.animalId,
    name: item.name,
    species: item.species,
    currentUnit: item.currentUnit,
    reasons: item.reasons.map((reason) => toReasonView(reason, today)),
  }));
}

function toReasonView(
  reason: AttentionQueueItem["reasons"][number],
  today: CalendarDay,
): AttentionReasonView {
  switch (reason.kind) {
    case "TASK_DUE":
      return {
        kind: "TASK_DUE",
        taskId: reason.taskId,
        title: reason.title,
        dueDate: reason.dueDate,
        // A task due at any point today is today's work, not a backlog item —
        // the same boundary the data layer's query draws.
        overdue: reason.dueDate < today,
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
        expectedEndDate: reason.expectedEndDate,
        fosterName: reason.fosterName,
      };
  }
}
