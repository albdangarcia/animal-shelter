import type { Actor } from "@/app/lib/auth/actor";
import { can } from "@/app/lib/auth/can";
import type { AppPermission } from "@/app/lib/auth/permissions";
import {
  FIND_ANIMALS_PERMISSIONS,
  findAnimalsTool,
} from "./tools/find-animals";
import {
  GET_ANIMAL_SUMMARY_PERMISSIONS,
  getAnimalSummaryTool,
} from "./tools/get-animal-summary";
import {
  GET_ATTENTION_QUEUE_PERMISSIONS,
  getAttentionQueueTool,
} from "./tools/get-attention-queue";

export type AiToolName =
  | "findAnimals"
  | "getAnimalSummary"
  | "getAttentionQueue";

const AI_TOOLS = {
  findAnimals: findAnimalsTool,
  getAnimalSummary: getAnimalSummaryTool,
  getAttentionQueue: getAttentionQueueTool,
};

export type AiToolSet = typeof AI_TOOLS;

// The permission requirement is declared once, next to each tool; this table
// only references those constants, so the registry filter and each tool's own
// `requireFor` cannot drift.
const TOOL_PERMISSIONS: Record<AiToolName, readonly AppPermission[]> = {
  findAnimals: FIND_ANIMALS_PERMISSIONS,
  getAnimalSummary: GET_ANIMAL_SUMMARY_PERMISSIONS,
  getAttentionQueue: GET_ATTENTION_QUEUE_PERMISSIONS,
};

const TOOL_NAMES = Object.keys(TOOL_PERMISSIONS) as AiToolName[];

/** The tool names an actor's role can use — filtered by `can`. */
export function toolNamesForActor(actor: Actor): AiToolName[] {
  return TOOL_NAMES.filter((name) =>
    TOOL_PERMISSIONS[name].every((permission) => can(actor.role, permission)),
  );
}

/**
 * The tools an actor's request should carry, plus the matching `toolsContext`
 * (AI SDK 7: a per-tool map keyed by tool name — each tool receives only its
 * own entry, validated against its `contextSchema`;
 * A tool the actor lacks permission for is absent from *both*
 * objects at runtime — the model never learns it exists.
 *
 * The return is typed as the complete set because AI SDK 7 infers whether
 * `toolsContext` is required from the *static* tool type: a `Partial<>` there
 * collapses the inference and the SDK then rejects `toolsContext` entirely.
 * The runtime object is genuinely filtered; a caller only ever passes it
 * straight to `generateText`/`streamText`, which iterate the real keys.
 */
export function buildToolsForActor(actor: Actor): {
  tools: AiToolSet;
  toolsContext: Record<AiToolName, Actor>;
} {
  const tools: Record<string, AiToolSet[AiToolName]> = {};
  const toolsContext: Record<string, Actor> = {};

  for (const name of toolNamesForActor(actor)) {
    tools[name] = AI_TOOLS[name];
    toolsContext[name] = actor;
  }

  return {
    tools: tools as AiToolSet,
    toolsContext: toolsContext as Record<AiToolName, Actor>,
  };
}
