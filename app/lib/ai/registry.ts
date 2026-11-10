import type { Actor } from "@/app/lib/auth/actor";
import type { AiToolName } from "./tool-names";
import { findAnimalsTool } from "./tools/find-animals";
import { getAnimalReadinessTool } from "./tools/get-animal-readiness";
import { getAnimalSummaryTool } from "./tools/get-animal-summary";
import { getAttentionQueueTool } from "./tools/get-attention-queue";
import { readGuideTool } from "./tools/read-guide";
import { searchGuidesTool } from "./tools/search-guides";
import { setTaskStatusTool } from "./tools/set-task-status";
import { toolNamesForActor } from "./tool-permissions";

export type { AiToolName };

// `satisfies` rather than a type annotation: it keeps the literal type (which
// `AiToolSet` and the SDK's tool-part inference are built from) while still
// failing the build if the table and `AiToolName` ever disagree in either
// direction.
const AI_TOOLS = {
  findAnimals: findAnimalsTool,
  getAnimalReadiness: getAnimalReadinessTool,
  getAnimalSummary: getAnimalSummaryTool,
  getAttentionQueue: getAttentionQueueTool,
  searchGuides: searchGuidesTool,
  readGuide: readGuideTool,
  setTaskStatus: setTaskStatusTool,
} satisfies Record<AiToolName, unknown>;

export type AiToolSet = typeof AI_TOOLS;

// Which tools an actor gets is `toolNamesForActor`, in `tool-permissions.ts`:
// the permission each tool needs is declared there once, apart from the tools
// (most of which import Prisma) so the filter is unit-testable, and each
// tool's `execute` enforces the same constant again with `requireFor`.

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
