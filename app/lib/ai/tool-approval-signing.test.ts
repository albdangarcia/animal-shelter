import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateText,
  stepCountIs,
  tool,
  InvalidToolApprovalSignatureError,
  type ModelMessage,
} from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { z } from "zod";

/**
 * The adversarial check the phase turns on: a tampered approval must
 * be rejected. It cannot be forced by hand through the browser — you would have
 * to rewrite the outgoing request body mid-flight — so it is forced here at the
 * SDK level, against a stub tool. The signing is tool-agnostic: what matters is
 * that `experimental_toolApprovalSecret` binds the approval to the exact tool
 * name, call id, and arguments, and that a mismatch on replay throws rather than
 * executes.
 *
 * No Prisma, no env, no network — this file runs in `npm test`.
 */

const SECRET = "phase6-test-approval-secret-not-a-real-one";
const TASK_ID = "task_abcdefghijklmnopqrstuvwx";

const usage = () => ({
  inputTokens: { total: 8, noCache: 8, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 4, text: 4, reasoning: 0 },
});

const toolCallResult = (
  toolInput: Record<string, unknown>,
): LanguageModelV4GenerateResult => ({
  content: [
    {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "setTaskStatus",
      input: JSON.stringify(toolInput),
    },
  ],
  finishReason: { unified: "tool-calls", raw: "tool_calls" },
  usage: usage(),
  warnings: [],
});

const textResult = (): LanguageModelV4GenerateResult => ({
  content: [{ type: "text", text: "done" }],
  finishReason: { unified: "stop", raw: "stop" },
  usage: usage(),
  warnings: [],
});

/** A stub with the real tool's input shape and a spy for whether it executed. */
function stubTool() {
  const calls: { taskId: string; status: string }[] = [];
  return {
    calls,
    tool: tool({
      description: "stub",
      inputSchema: z.object({ taskId: z.string(), status: z.string() }),
      async execute(input: { taskId: string; status: string }) {
        calls.push(input);
        return { ok: true as const };
      },
    }),
  };
}

/**
 * Runs one turn where the model calls `setTaskStatus`, the approval policy asks
 * for user approval, and generation stops with a signed approval request in the
 * response messages.
 */
async function requestApproval(toolInput: { taskId: string; status: string }) {
  const { tool: setTaskStatus, calls } = stubTool();

  const model = new MockLanguageModelV4({
    doGenerate: async () => toolCallResult(toolInput),
  });

  const result = await generateText({
    model,
    tools: { setTaskStatus },
    toolApproval: {
      setTaskStatus: () => ({ type: "user-approval", reason: "confirm" }),
    },
    experimental_toolApprovalSecret: SECRET,
    stopWhen: stepCountIs(3),
    prompt: "mark the task done",
  });

  return { responseMessages: result.response.messages, calls };
}

/** Replays an approval response against the given (possibly tampered) history. */
async function replay(history: ModelMessage[], approvalId: string) {
  const { tool: setTaskStatus, calls } = stubTool();

  const model = new MockLanguageModelV4({
    doGenerate: async () => textResult(),
  });

  await generateText({
    model,
    tools: { setTaskStatus },
    toolApproval: {
      setTaskStatus: () => ({ type: "user-approval", reason: "confirm" }),
    },
    experimental_toolApprovalSecret: SECRET,
    stopWhen: stepCountIs(3),
    messages: [
      { role: "user", content: "mark the task done" },
      ...history,
      {
        role: "tool",
        content: [
          {
            type: "tool-approval-response",
            approvalId,
            approved: true,
          },
        ],
      },
    ],
  });

  return { calls };
}

function approvalIdOf(messages: ModelMessage[]): string {
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (
        typeof part === "object" &&
        part !== null &&
        (part as { type?: string }).type === "tool-approval-request"
      ) {
        return (part as { approvalId: string }).approvalId;
      }
    }
  }
  throw new Error("no tool-approval-request in response messages");
}

function clone(messages: ModelMessage[]): ModelMessage[] {
  return JSON.parse(JSON.stringify(messages)) as ModelMessage[];
}

test("a verbatim approval replay executes the tool", async () => {
  const { responseMessages } = await requestApproval({
    taskId: TASK_ID,
    status: "DONE",
  });
  const { calls } = await replay(
    responseMessages,
    approvalIdOf(responseMessages),
  );
  assert.deepEqual(calls, [{ taskId: TASK_ID, status: "DONE" }]);
});

test("mutating the tool input after approval is rejected, not executed", async () => {
  const { responseMessages } = await requestApproval({
    taskId: TASK_ID,
    status: "DONE",
  });
  const approvalId = approvalIdOf(responseMessages);

  const tampered = clone(responseMessages);
  for (const message of tampered) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const p = part as { type?: string; input?: unknown };
      if (p.type === "tool-call") {
        p.input = { taskId: "task_someone_elses_record", status: "DONE" };
      }
    }
  }

  await assert.rejects(
    () => replay(tampered, approvalId),
    (error: unknown) => {
      assert.ok(
        InvalidToolApprovalSignatureError.isInstance(error),
        `expected InvalidToolApprovalSignatureError, got ${String(error)}`,
      );
      return true;
    },
  );
});

test("stripping the approval signature fails closed", async () => {
  const { responseMessages } = await requestApproval({
    taskId: TASK_ID,
    status: "DONE",
  });
  const approvalId = approvalIdOf(responseMessages);

  const stripped = clone(responseMessages);
  for (const message of stripped) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const p = part as { type?: string; signature?: unknown };
      if (p.type === "tool-approval-request") delete p.signature;
    }
  }

  await assert.rejects(
    () => replay(stripped, approvalId),
    (error: unknown) =>
      InvalidToolApprovalSignatureError.isInstance(error),
  );
});
