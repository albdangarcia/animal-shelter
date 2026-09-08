"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/app/lib/prisma";
import {
  RequirePermission,
  SessionUser,
  withAuthenticatedUser,
} from "../auth/protected-actions";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { AiActionTargetType } from "@/prisma/generated/enums";
import { cuidSchema } from "../zod-schemas/common.schemas";
import { applyTaskStatusChange } from "../tasks/apply-task-status-change";
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
} from "../utils/errors";
import { isTaskStatusStale, parseSnapshot, STALE_UNDO_MESSAGE } from "../data/ai-activity";

const MISSING_PERSON_MESSAGE =
  "Authentication Error: Your user account is not associated with a person record.";

/**
 * Undo one AI-initiated change.
 *
 * An undo is a *human* action: it restores the
 * logged `before` via `applyTaskStatusChange` — which writes a
 * `TASK_STATUS_CHANGED` activity entry attributed to whoever clicked — and marks
 * the `AiActionLog` row `undoneAt`. It does **not** write a new `AiActionLog`
 * row; that model means "the assistant changed something".
 *
 * Anyone holding `ANIMAL_TASK_MANAGE` can undo — the same permission that could
 * make the change by hand. Restricting undo to the original approver would leave
 * a mistake sitting until that person was next on shift.
 *
 * Returns `{ success, message }` (matching `updateAnimalTaskStatus`, the closest
 * sibling) — not `FormResult`; there is no form.
 */
const _undoAiAction = async (
  user: SessionUser,
  aiActionLogId: string,
): Promise<{ success: boolean; message: string }> => {
  const actorId = user.personId;
  if (!actorId) {
    return { success: false, message: MISSING_PERSON_MESSAGE };
  }

  const parsedId = cuidSchema.safeParse(aiActionLogId);
  if (!parsedId.success) {
    return { success: false, message: "Invalid activity entry id." };
  }

  // Checks 1–3, before writing anything.
  const log = await prisma.aiActionLog.findUnique({
    where: { id: parsedId.data },
  });
  if (!log) {
    return { success: false, message: "That activity entry was not found." };
  }
  if (log.undoneAt) {
    return { success: false, message: "This change has already been undone." };
  }
  const before = parseSnapshot(log.targetType, log.before);
  const after = parseSnapshot(log.targetType, log.after);
  if (!before.success || !after.success) {
    return {
      success: false,
      message: "This change can't be undone automatically.",
    };
  }
  const restoreTo = before.data;
  const leftAt = after.data;

  try {
    await prisma.$transaction(async (tx) => {
      // Re-read undone state inside the transaction — two people could click
      // Undo at the same moment.
      const fresh = await tx.aiActionLog.findUnique({
        where: { id: log.id },
        select: { undoneAt: true },
      });
      if (!fresh) {
        throw new NotFoundError("That activity entry was not found.");
      }
      if (fresh.undoneAt) {
        throw new ConflictError("This change has already been undone.");
      }

      // Restore the logged `before`. A switch on targetType so the second
      // target type is an added case, not a refactor.
      switch (log.targetType) {
        case AiActionTargetType.TASK: {
          const task = await tx.task.findUnique({
            where: { id: log.targetId },
            select: { status: true },
          });
          if (!task) {
            throw new NotFoundError(
              "The task this change applied to no longer exists.",
            );
          }
          // Evaluated inside the transaction
          // so nothing can slip between the check and the write.
          if (isTaskStatusStale(task.status, leftAt)) {
            throw new PreconditionFailedError(STALE_UNDO_MESSAGE);
          }
          await applyTaskStatusChange(tx, {
            taskId: log.targetId,
            status: restoreTo.status,
            changedById: actorId,
          });
          break;
        }
        default: {
          const unsupported: never = log.targetType;
          throw new Error(
            `Unsupported AiActionLog target type: ${String(unsupported)}`,
          );
        }
      }

      await tx.aiActionLog.update({
        where: { id: log.id },
        data: { undoneAt: new Date() },
      });
    });
  } catch (error) {
    if (
      error instanceof PreconditionFailedError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError
    ) {
      return { success: false, message: error.message };
    }
    console.error("Error undoing AI action:", error);
    return {
      success: false,
      message: "Something went wrong undoing that change.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/animal-tasks");
  revalidatePath("/dashboard/settings/ai-activity");

  return { success: true, message: "Change undone." };
};

export const undoAiAction = withAuthenticatedUser(
  RequirePermission(AppPermissions.ANIMAL_TASK_MANAGE)(_undoAiAction),
);
