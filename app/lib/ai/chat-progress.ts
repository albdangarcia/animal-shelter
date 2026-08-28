import { getToolName, isStaticToolUIPart } from "ai";
import type { AiToolName } from "./tool-names";
import type { ShelterUIMessage } from "./ui-message";

type ChatPart = ShelterUIMessage["parts"][number];

/**
 * Only the *static* tool parts — the three tools this app declares. AI SDK's
 * `isToolUIPart` also admits `dynamic-tool` parts, whose `input` and `output`
 * are `unknown`; nothing here produces one, and accepting them would throw away
 * the typing that makes reading an animal's name out of a prior step safe.
 */
type ToolPart = Extract<ChatPart, { type: `tool-${string}` }>;

/**
 * Deriving what the assistant is *currently doing* from the parts already on
 * the streaming message. No extra state, no extra requests: `useChat` appends
 * parts as the tool loop runs, so re-reading the tail of the array on each
 * render is the whole mechanism.
 *
 * Pure and UI-free so it can be unit tested — the transitions here (a tool
 * replaced by the next tool, then replaced by the answer) are the part of the
 * indicator most likely to regress, and the hardest to catch by eye against a
 * 40-second stream.
 */

/**
 * Human labels, not tool names. The person asked about animals; "calling
 * getAttentionQueue" tells them nothing they wanted to know.
 */
const STEP_LABELS: Record<AiToolName, string> = {
  getAttentionQueue: "Checking today's attention queue",
  findAnimals: "Looking up animals",
  getAnimalSummary: "Reading the record",
};

const THINKING_STEP = { key: "thinking", label: "Thinking" } as const;

export type ActiveStep = { key: string; label: string };

export type ToolFailureNote = { toolCallId: string; reason: string };

/**
 * Animal id → name, harvested from tool output already on the message.
 *
 * This is what makes "Reading Juniper's record…" cheap: `getAnimalSummary`
 * takes an id, and that id can only have come from a previous step's output —
 * `findAnimals` and `getAttentionQueue` both return `animalId` next to `name`.
 * So the name is already in hand and the lookup is a walk over parts we are
 * rendering anyway.
 */
export function resolveAnimalNames(parts: readonly ChatPart[]): Map<string, string> {
  const names = new Map<string, string>();

  for (const part of parts) {
    switch (part.type) {
      case "tool-findAnimals":
        if (part.state === "output-available" && part.output.ok) {
          for (const match of part.output.matches) {
            names.set(match.animalId, match.name);
          }
        }
        break;
      case "tool-getAttentionQueue":
        if (part.state === "output-available" && part.output.ok) {
          for (const entry of part.output.queue) {
            names.set(entry.animalId, entry.name);
          }
        }
        break;
      case "tool-getAnimalSummary":
        if (part.state === "output-available" && part.output.ok) {
          names.set(part.output.animal.animalId, part.output.animal.name);
        }
        break;
    }
  }

  return names;
}

function labelForToolPart(
  part: ToolPart,
  animalNames: Map<string, string>,
): string {
  // `input` is still arriving while the model streams the arguments, so the
  // name is only sometimes available — the generic label is the honest
  // fallback, not a failure.
  if (part.type === "tool-getAnimalSummary" && part.input?.animalId) {
    const name = animalNames.get(part.input.animalId);
    if (name) return `Reading ${name}'s record`;
  }

  return STEP_LABELS[getToolName(part) as AiToolName] ?? "Working";
}

/**
 * The single indicator shown under the user's message, or `null` when the
 * answer itself should be on screen instead.
 *
 * The rule is just "what is the last thing on the message": a tool part means a
 * lookup is in flight, and a non-empty text part means the answer has started
 * and replaces the indicator. Because it reads the tail rather than
 * accumulating, a second tool call overwrites the first in place instead of
 * stacking up a log — the sequence of lookups is scaffolding, and keeping it
 * around also makes a model that retried a tool look like it fumbled.
 */
export function describeActiveStep(input: {
  status: "submitted" | "streaming" | "ready" | "error";
  messages: readonly ShelterUIMessage[];
}): ActiveStep | null {
  if (input.status !== "submitted" && input.status !== "streaming") {
    return null;
  }

  const message = input.messages.at(-1);
  if (!message || message.role !== "assistant") {
    // Sent, nothing streamed back yet.
    return THINKING_STEP;
  }

  // Names are collected from the whole conversation, not just this turn. The
  // common shape is two turns — "tell me about Bruno" resolves the pair, then
  // "the one in Dog block A" chains straight into `getAnimalSummary` with an id
  // the model remembered. Looking only at the current message would fall back
  // to the generic label in exactly the case the name is most useful.
  const animalNames = resolveAnimalNames(
    input.messages.flatMap((m) => m.parts),
  );

  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];

    // `step-start` is a boundary marker between tool-loop steps, not activity.
    if (part.type === "step-start") continue;

    if (part.type === "text") {
      // An empty text part is the model opening a text block it has not filled
      // yet — still working, not yet answering.
      return part.text.trim() === "" ? THINKING_STEP : null;
    }

    if (isStaticToolUIPart(part)) {
      return { key: part.toolCallId, label: labelForToolPart(part, animalNames) };
    }
  }

  return THINKING_STEP;
}

/**
 * Tool failures worth leaving in the transcript.
 *
 * The exception to "progress is scaffolding": if a lookup failed and the
 * model recovered, the final answer can read as complete while resting on less
 * than the person assumes. They need to know something didn't work.
 */
export function collectToolFailures(
  parts: readonly ChatPart[],
): ToolFailureNote[] {
  const notes: ToolFailureNote[] = [];
  // A model that hits a failing tool usually retries it, which produces the
  // same note two or three times over. Repeating it tells the person nothing
  // they did not learn the first time, so identical reasons collapse.
  const seenReasons = new Set<string>();

  const add = (toolCallId: string, reason: string) => {
    if (seenReasons.has(reason)) return;
    seenReasons.add(reason);
    notes.push({ toolCallId, reason });
  };

  for (const part of parts) {
    if (!isStaticToolUIPart(part)) continue;

    if (part.state === "output-available" && !part.output.ok) {
      add(part.toolCallId, part.output.reason);
    } else if (part.state === "output-error") {
      // Tools return structured failures rather than throwing, so this is
      // the path that should not happen. `errorText` originates server-side and
      // may carry provider or database text, so it is deliberately not shown.
      add(part.toolCallId, "A lookup failed unexpectedly.");
    }
  }

  return notes;
}
