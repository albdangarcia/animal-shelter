/**
 * The tool-name vocabulary, kept in a module with no server imports.
 *
 * `registry.ts` transitively pulls in the Prisma data layer, so a
 * `"use client"` component cannot import a *value* from it. The chat UI needs
 * two: the set of write tools (to know when to refresh the page behind it) and
 * the names it filters example questions on. They live here.
 *
 * `registry.ts` asserts that its tool table has exactly these keys, so adding a
 * tool there without listing it here is a type error rather than a silent gap.
 */
export type AiToolName =
  | "findAnimals"
  | "getAnimalSummary"
  | "getAttentionQueue";

/**
 * Tool names whose execution mutates data. The chat client calls
 * `router.refresh()` after a turn that used one: the chat is a client
 * component, so the dashboard behind it would otherwise be stale, and
 * `revalidatePath` cannot be called from a tool.
 */
export const WRITE_TOOL_NAMES: readonly AiToolName[] = [];
