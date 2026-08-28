import type { AiToolName } from "./tool-names";

/**
 * The example questions the empty state offers.
 *
 * Nobody arrives at a chat box in a shelter app knowing what it can do, so the
 * empty state has to teach the tool set. These are drawn from what the seed can
 * actually answer, which makes the empty state double as the demo path: the
 * attention queue, the deliberate two-Bruno collision, an animal in an acute
 * health status, and a summary with open tasks attached.
 *
 * Because the animal names are seed fixtures, they change when the seed does —
 * see `attentionScenarioAnimalNames` and the "Bruno" pair in `prisma/seed.ts`.
 */
export type ChatExample = {
  /** Shown on the chip. */
  label: string;
  /** Sent as the message — chips populate and send in one click. */
  prompt: string;
  /**
   * The tools an answer needs. Filtered against the caller's own tool set, so
   * role-awareness comes from the same `can()` decisions the registry makes and
   * there is no second copy of the role matrix to drift (D4).
   */
  requiresTools: readonly AiToolName[];
};

const CHAT_EXAMPLES: readonly ChatExample[] = [
  {
    label: "What needs attention today?",
    prompt: "What animals need attention today?",
    requiresTools: ["getAttentionQueue"],
  },
  {
    label: "Tell me about Bruno",
    prompt: "Tell me about Bruno.",
    requiresTools: ["findAnimals", "getAnimalSummary"],
  },
  {
    label: "What's going on with Fern?",
    prompt: "What's going on with Fern? Is anyone looking after her?",
    requiresTools: ["findAnimals", "getAnimalSummary"],
  },
  {
    label: "Does Juniper have open tasks?",
    prompt: "Does Juniper have any open tasks?",
    requiresTools: ["findAnimals", "getAnimalSummary"],
  },
] as const;

/**
 * The examples an actor can actually have answered.
 *
 * Tools are all reads that volunteers and staff both hold, so this filter
 * passes everything for every role that can reach the page — which is the
 * correct outcome, not a missing feature.
 */
export function examplesForTools(
  availableTools: readonly AiToolName[],
): ChatExample[] {
  const available = new Set(availableTools);
  return CHAT_EXAMPLES.filter((example) =>
    example.requiresTools.every((tool) => available.has(tool)),
  );
}
