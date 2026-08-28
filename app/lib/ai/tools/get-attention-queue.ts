import { tool } from "ai";
import { z } from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { requireFor } from "@/app/lib/auth/actor";
import { _fetchAttentionQueue } from "@/app/lib/data/animals/attention-queue.data";
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

// Both reads: the queue puts task detail next to animal identity.
export const GET_ATTENTION_QUEUE_PERMISSIONS = [
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_TASK_READ,
];

export const getAttentionQueueTool = tool({
  description:
    "List the animals that need attention today and why. Each entry carries " +
    "one or more structured reasons: an overdue or due-today task, an acute " +
    "health status with no open task, or a foster placement past its " +
    "expected end date. Use this for questions like \"what needs attention\", " +
    "\"what's overdue\", or \"what should we prioritise today\". Takes no " +
    "arguments. Sorted most urgent first.",
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
      const items = await _fetchAttentionQueue();
      return { ok: true, queue: toAttentionQueueView(items) };
    } catch (error) {
      return toolFailure(describeToolError(error));
    }
  },
});
