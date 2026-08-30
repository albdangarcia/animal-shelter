import { NextResponse } from "next/server";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { getCachedSession } from "@/app/lib/auth/session";
import { can } from "@/app/lib/auth/can";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { toActor } from "@/app/lib/auth/actor";
import { PreconditionFailedError } from "@/app/lib/utils/errors";
import { MAX_STEPS, model } from "@/app/lib/ai/provider";
import { AiProviderConfigError } from "@/app/lib/ai/provider-guard";
import { getToolApprovalSecret } from "@/app/lib/ai/approval-secret";
import { buildToolsForActor } from "@/app/lib/ai/registry";
import { WRITE_TOOL_NAMES } from "@/app/lib/ai/tool-names";
import { buildSystemPrompt } from "@/app/lib/ai/prompt";
import { setTaskStatusApproval } from "@/app/lib/ai/tools/set-task-status";
import { CHAT_ERROR_COPY, classifyChatError } from "@/app/lib/ai/chat-errors";
import type { ShelterUIMessage } from "@/app/lib/ai/ui-message";

/**
 * Seconds the whole streamed turn may take, including the tool loop.
 *
 * Measured on this seed through the streaming route with Groq
 * `openai/gpt-oss-120b`: 0.7–1.3s to first token and 1.7–2.0s to a
 * complete two-step answer, with the slowest observed run at 9.8s first token /
 * 10.8s complete. `MAX_STEPS` bounds the worst case.
 *
 * 60 is deliberate rather than generous: it is the largest value valid on every
 * Vercel configuration, including Hobby without Fluid compute, and a value the
 * plan disallows fails the build rather than degrading. Raise it only after
 * confirming the deployment target's ceiling — with Fluid compute the limit is
 * 300s, which is the number to use if the tool loop ever grows past two or
 * three steps in the common case.
 *
 * Under Groq the binding constraint is that platform ceiling, not latency: the
 * observed answers finish well inside 60s, so 60 buys portability across Vercel
 * plans rather than headroom for a slow provider.
 */
export const maxDuration = 60;

/**
 * The chat endpoint.
 *
 * and the reason this handler looks the way it does: tool `execute` runs
 * *after* this function has returned its `Response`, while the stream is still
 * open. Request-scoped async storage is not reliably available there. So the
 * session is read once, here, at the top; the actor is derived from it and
 * handed to the tools through `toolsContext`. Nothing downstream of
 * `streamText` may call `headers()`, `cookies()`, `getCachedSession()`, or
 * `revalidatePath()`.
 *
 * The request body contributes exactly one thing: the messages. Role, actor,
 * and tool list are all derived server-side from the session cookie — a role
 * or tool name arriving in the body is ignored, not trusted.
 */
export async function POST(request: Request) {
  const session = await getCachedSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized: You must be logged in." },
      { status: 401 },
    );
  }

  if (!can(session.user.role, AppPermissions.AI_CHAT_USE)) {
    return NextResponse.json(
      { error: "Forbidden: You do not have access to the AI assistant." },
      { status: 403 },
    );
  }

  let actor;
  try {
    actor = toActor(session.user);
  } catch (error) {
    // A user with no linked person record is authenticated but unusable —
    // a broken User → Person link, not a missing session.
    if (error instanceof PreconditionFailedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  let messages: ShelterUIMessage[];
  try {
    ({ messages } = (await request.json()) as { messages: ShelterUIMessage[] });
  } catch {
    return NextResponse.json(
      { error: "Bad Request: expected a JSON body." },
      { status: 400 },
    );
  }
  if (!Array.isArray(messages)) {
    return NextResponse.json(
      { error: "Bad Request: `messages` must be an array." },
      { status: 400 },
    );
  }

  // Filtered by the caller's permissions. A tool this actor may not use is
  // absent from both objects, so the model never learns it exists.
  const { tools, toolsContext } = buildToolsForActor(actor);
  const availableTools = Object.keys(tools) as (keyof typeof tools)[];

  // Write tools sign their approval requests. Fail closed: a missing secret
  // must not degrade to unsigned approvals, so if this actor's set contains a
  // write tool and the secret is unset, refuse the whole request rather than
  // stream one that could be approved by a forged message. A volunteer's
  // read-only chat does not reach this.
  const hasWriteTool = WRITE_TOOL_NAMES.some((name) => name in tools);
  let toolApprovalSecret: string | undefined;
  if (hasWriteTool) {
    try {
      toolApprovalSecret = getToolApprovalSecret();
    } catch (error) {
      if (error instanceof AiProviderConfigError) {
        console.error("AI chat refused: approval secret missing.", error);
        return NextResponse.json(
          { error: CHAT_ERROR_COPY.misconfigured },
          { status: 500 },
        );
      }
      throw error;
    }
  }

  const result = streamText({
    model,
    instructions: buildSystemPrompt({
      actor,
      displayName: session.user.name,
      availableTools,
    }),
    messages: await convertToModelMessages(messages),
    tools,
    toolsContext,
    // The actor is re-derived from the session on every turn regardless of
    // signing — message history is client input, and signing protects the
    // approval, not the identity. The approval function resolves the task
    // server-side and builds the confirmation card's text from the database.
    toolApproval: { setTaskStatus: setTaskStatusApproval },
    experimental_toolApprovalSecret: toolApprovalSecret,
    stopWhen: isStepCount(MAX_STEPS),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // The current model reasons before answering. That reasoning is not
      // rendered — the progress indicator is what the person watches — and
      // shipping it would put the model's half-formed statements about shelter
      // data in the browser for no benefit.
      sendReasoning: false,
      onError: describeStreamError,
    }),
  });
}

/**
 * Turns a mid-stream failure into copy a person can act on.
 *
 * Whatever this returns is sent to the browser, so it is picked from the
 * authored table rather than derived from the provider's message. The raw error
 * is logged here instead — Groq's free-tier ceiling was not hit once
 * but a capacity or rate-limit failure still needs to
 * be confirmable in the server log when it does happen.
 */
function describeStreamError(error: unknown): string {
  console.error("AI chat stream failed.", error);

  const message = error instanceof Error ? error.message : String(error);
  return CHAT_ERROR_COPY[classifyChatError(message)];
}
