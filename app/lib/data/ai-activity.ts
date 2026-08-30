import { z } from "zod";
import { AiActionTargetType, TaskStatus } from "@/prisma/generated/enums";

/**
 * Pure rules for reading and undoing `AiActionLog` rows. No Prisma, no I/O —
 * imported by both the data function (`ai-activity.data.ts`) and the undo
 * action (`actions/ai-activity.actions.ts`), and unit-tested directly
 * (`ai-activity.test.ts`), mirroring `data/animals/attention-queue.ts`.
 */

/**
 * The shape `setTaskStatus` writes into `AiActionLog.before` / `.after`
 * for a `TASK` target: `{ status: <TaskStatus> }`. Those are `Json` columns, so
 * nothing downstream may assume this shape until the value has parsed against
 * this schema. Non-strict on purpose — only `status` is load-bearing, and a
 * future writer adding a sibling key should not make an existing row un-undoable.
 */
export const taskStatusSnapshotSchema = z.object({
  status: z.enum(TaskStatus),
});

export type TaskStatusSnapshot = z.infer<typeof taskStatusSnapshotSchema>;

/**
 * The zod schema for a given target type's `before` / `after` snapshot.
 *
 * `TASK` is the only member of `AiActionTargetType` today. The `satisfies never`
 * in the default branch fails the build if a member is added without a schema
 * here; `z.never()` keeps `parseSnapshot` non-throwing in the meantime.
 */
export function snapshotSchemaFor(
  targetType: AiActionTargetType,
): z.ZodType<TaskStatusSnapshot> | z.ZodNever {
  switch (targetType) {
    case AiActionTargetType.TASK:
      return taskStatusSnapshotSchema;
    default:
      targetType satisfies never;
      return z.never();
  }
}

/**
 * Parse an `AiActionLog` `before` / `after` `Json` value for its target type.
 * Never throws — returns a zod `SafeParseReturnType`. A row whose snapshots
 * don't parse cannot be undone automatically.
 */
export function parseSnapshot(targetType: AiActionTargetType, value: unknown) {
  return snapshotSchemaFor(targetType).safeParse(value);
}

/**
 * The undo staleness rule.
 *
 * `after` is what the assistant left the task at. `currentStatus` is the live
 * value now. If they differ, someone changed the task since the assistant
 * touched it, and undo must refuse rather than overwrite that person's change.
 */
export function isTaskStatusStale(
  currentStatus: TaskStatus,
  after: TaskStatusSnapshot,
): boolean {
  return currentStatus !== after.status;
}

/** Shown to the person when undo refuses because the record moved on. Worded so
 *  they look at the task rather than assume something is broken. */
export const STALE_UNDO_MESSAGE =
  "This task was changed after the assistant modified it, so it can't be undone automatically.";

/** Human label for a tool name, for the "what" column. Falls back to the raw
 *  name so a new write tool shows *something* before it gets an entry here. */
const TOOL_LABELS: Record<string, string> = {
  setTaskStatus: "Task status change",
};

export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}
