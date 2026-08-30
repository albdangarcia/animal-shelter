import { tool } from "ai";
import type { ModelMessage, ToolApprovalStatus } from "ai";
import { z } from "zod";
import prisma from "@/app/lib/prisma";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { requireFor, type Actor } from "@/app/lib/auth/actor";
import { AiActionTargetType, TaskStatus } from "@/prisma/generated/enums";
import { applyTaskStatusChange } from "@/app/lib/tasks/apply-task-status-change";
import { actorContextSchema } from "../context";
import {
  buildApprovalReason,
  formatUnitLabel,
} from "./set-task-status-reason";
import {
  describeToolError,
  toolFailure,
  type ToolResult,
} from "./tool-result";

export { buildApprovalReason } from "./set-task-status-reason";

/**
 * Declared once, here — `registry.ts` filters the tool set on the same
 * constant and `execute` enforces it again. Staff and admin only; a volunteer's
 * registry never contains this tool.
 */
export const SET_TASK_STATUS_PERMISSIONS = [AppPermissions.ANIMAL_TASK_MANAGE];

// `z.looseObject` would preserve unknown keys for the forensic log, but Groq's
// tool schema path is happier with a plain object and this schema has no
// transforms, coercions, or defaults — so for any call that actually reaches
// `execute` the validated input equals what the model sent. The `AiActionLog`
// stores that object.
const setTaskStatusInput = z.object({
  taskId: z
    .string()
    .describe(
      "The task id from getAnimalSummary's openTasks. Never a task title or " +
        "an animal name — resolve the animal with findAnimals, read its tasks " +
        "with getAnimalSummary, then pass the openTasks[].taskId here.",
    ),
  status: z
    .enum(TaskStatus)
    .describe("The new status. Usually DONE. Also SKIPPED, IN_PROGRESS, TODO."),
});

export type SetTaskStatusInput = z.infer<typeof setTaskStatusInput>;

export type SetTaskStatusOk = {
  taskId: string;
  title: string;
  previousStatus: TaskStatus;
  newStatus: TaskStatus;
  /** false when the task was already in that status — no write, no log rows. */
  changed: boolean;
};

/**
 * The tool-call id's approval id, dug out of the model messages the SDK hands
 * `execute` on the continuation turn. Both ids are stable within a turn and are
 * what a forensic row correlates against (Correction 2 — there is no
 * conversationId/messageId, conversations are ephemeral). `null` if not found
 * — the column is nullable.
 */
function findApprovalId(
  messages: ModelMessage[],
  toolCallId: string,
): string | null {
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "tool-approval-request" &&
        "toolCallId" in part &&
        part.toolCallId === toolCallId &&
        "approvalId" in part &&
        typeof part.approvalId === "string"
      ) {
        return part.approvalId;
      }
    }
  }
  return null;
}

/**
 * The per-call approval policy for `setTaskStatus`, wired into
 * `streamText({ toolApproval: { setTaskStatus: setTaskStatusApproval } })`.
 *
 * It resolves the task server-side and returns a `user-approval` status whose
 * `reason` the SDK emits on the approval request (verified against
 * `ai@7`'s source, not just the docs). Two cases deny outright rather than
 * asking a person to confirm something pointless or impossible:
 *
 * - the id does not resolve to a task (the model can hallucinate a cuid);
 * - the task is already in the requested status (the no-op guard,
 *   moved up front so `execute` only runs on a real change).
 *
 * Runs at request time and again on replay (the SDK re-evaluates the policy
 * when the approval comes back) — a DB read plus a string build, idempotent.
 * Reads only Prisma and the injected actor; no `headers()` / `cookies()`.
 */
export async function setTaskStatusApproval(
  input: SetTaskStatusInput,
  _options: {
    toolCallId: string;
    messages: ModelMessage[];
    toolContext: Actor;
    runtimeContext: unknown;
  },
): Promise<ToolApprovalStatus> {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: {
      title: true,
      status: true,
      animal: {
        select: {
          name: true,
          currentUnit: {
            select: { name: true, location: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!task) {
    return {
      type: "denied",
      reason:
        "No task exists with that id, so nothing was changed. Ask the user " +
        "to name the animal, look up its tasks, and try again.",
    };
  }

  if (task.status === input.status) {
    return {
      type: "denied",
      reason: `Task "${task.title}" on ${task.animal.name} is already ${input.status}. No change needed.`,
    };
  }

  return {
    type: "user-approval",
    reason: buildApprovalReason({
      taskTitle: task.title,
      animalName: task.animal.name,
      unitLabel: formatUnitLabel(task.animal.currentUnit),
      currentStatus: task.status,
      requestedStatus: input.status,
    }),
  };
}

/**
 * The write. One transaction: the shared `applyTaskStatusChange` body (task
 * update + `AnimalActivityLog`, exactly as the server action runs it) plus an
 * `AiActionLog` row carrying before/after for the undo path. A task
 * never changes without both log rows.
 *
 * No `revalidatePath` — the client calls `router.refresh()`.
 */
async function writeTaskStatus(
  actor: Actor,
  params: {
    input: SetTaskStatusInput;
    toolCallId: string;
    approvalId: string | null;
  },
): Promise<SetTaskStatusOk> {
  const { input, toolCallId, approvalId } = params;

  return prisma.$transaction(async (tx) => {
    const result = await applyTaskStatusChange(tx, {
      taskId: input.taskId,
      status: input.status,
      changedById: actor.personId,
    });

    // The approval policy already denies a no-op, so `changed` is defense in
    // depth against a status that matched only by the time this ran. A no-op
    // writes no rows.
    if (result.changed) {
      await tx.aiActionLog.create({
        data: {
          toolName: "setTaskStatus",
          toolCallId,
          approvalId,
          targetType: AiActionTargetType.TASK,
          targetId: input.taskId,
          input,
          before: { status: result.previousStatus },
          after: { status: input.status },
          actorId: actor.personId,
        },
      });
    }

    return {
      taskId: input.taskId,
      title: result.title,
      previousStatus: result.previousStatus,
      newStatus: input.status,
      changed: result.changed,
    };
  });
}

export const setTaskStatusTool = tool({
  description:
    "Change one task's status (for example, mark it DONE). Staff action. The " +
    "user is shown a confirmation card with the task's real title, animal, " +
    "and current status, and must approve before anything is written — so do " +
    "not tell the user the task is done until this tool returns a result. " +
    "Takes a task id (from getAnimalSummary's openTasks) and the new status; " +
    "never a task title or animal name. Change one task per call. If the id " +
    "is wrong or the task is already in that status the approval is declined " +
    "with a reason — relay it, do not retry blindly.",
  inputSchema: setTaskStatusInput,
  contextSchema: actorContextSchema,
  async execute(
    input,
    { context, toolCallId, messages },
  ): Promise<ToolResult<{ result: SetTaskStatusOk }>> {
    try {
      for (const permission of SET_TASK_STATUS_PERMISSIONS) {
        requireFor(context, permission);
      }
      const result = await writeTaskStatus(context, {
        input,
        toolCallId,
        approvalId: findApprovalId(messages, toolCallId),
      });
      return { ok: true, result };
    } catch (error) {
      return toolFailure(describeToolError(error));
    }
  },
});
