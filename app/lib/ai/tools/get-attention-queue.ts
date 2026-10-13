import { tool } from "ai";
import { z } from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { requireFor } from "@/app/lib/auth/actor";
import { _fetchAttentionQueue } from "@/app/lib/data/animals/attention-queue.data";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { actorContextSchema } from "../context";
import {
  toAttentionQueueView,
  type AttentionQueueEntry,
} from "../projections/attention-queue";
import {
  describeToolError,
  toolFailure,
  type ToolResult,
} from "./tool-result";

// All three reads: the queue puts task detail and scheduled medical care next
// to animal identity.
export const GET_ATTENTION_QUEUE_PERMISSIONS = [
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_TASK_READ,
  AppPermissions.MEDICAL_READ,
];

export const getAttentionQueueTool = tool({
  description:
    "List the animals that need attention today and why. Each entry carries " +
    "one or more structured reasons: an overdue or due-today task, a " +
    "vaccine, test, treatment, surgery, microchip or exam that's due today " +
    "or overdue, an acute " +
    "health status with no open task, or a foster placement past its " +
    "expected end date. Use this for questions like \"what needs attention\", " +
    "\"what's overdue\", or \"what should we prioritise today\". Takes no " +
    "arguments. The result is already sorted most urgent first: an animal's " +
    "place is set by its most pressing kind of reason (a task, then medical " +
    "care, then acute health, then a foster placement), and within a kind by " +
    "the earliest date. Report every entry, in the order given, and do not " +
    "drop or summarise any away. A task or medical reason carries " +
    "`overdue: true` when it should already have been done: say so, and never " +
    "present it as less important than a reason of the same kind that is " +
    "due today.",
  inputSchema: z.object({}),
  contextSchema: actorContextSchema,
  async execute(
    _input,
    { context },
  ): Promise<ToolResult<{ queue: AttentionQueueEntry[] }>> {
    try {
      for (const permission of GET_ATTENTION_QUEUE_PERMISSIONS) {
        requireFor(context, permission);
      }
      const [items, today] = await Promise.all([
        _fetchAttentionQueue(),
        getShelterToday(),
      ]);
      return { ok: true, queue: toAttentionQueueView(items, today) };
    } catch (error) {
      return toolFailure(describeToolError(error));
    }
  },
});
