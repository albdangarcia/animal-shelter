/**
 * The tool-name vocabulary, kept in a module with no server imports.
 *
 * `registry.ts` transitively pulls in the Prisma data layer, so a
 * `"use client"` component cannot import a *value* from it — but the chat UI
 * and the example-question filter both need the tool-name vocabulary. It lives
 * here, with no server imports.
 *
 * `registry.ts` asserts that its tool table has exactly these keys, so adding a
 * tool there without listing it here is a type error rather than a silent gap.
 */
export type AiToolName =
  | "findAnimals"
  | "getAnimalSummary"
  | "getAttentionQueue"
  | "setTaskStatus";

/**
 * Tool names whose execution mutates data.
 *
 * The route uses this to decide whether a request needs the signed-approval
 * secret (fail closed if a write tool is in the set and it is unset). The chat
 * client refreshes the dashboard behind it after a successful write, but keys
 * that off the typed `tool-setTaskStatus` part directly — it must not refresh
 * on the turn that merely *requested* approval, which a name-only check cannot
 * tell apart.
 */
export const WRITE_TOOL_NAMES: readonly AiToolName[] = ["setTaskStatus"];
