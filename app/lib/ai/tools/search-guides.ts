import { tool } from "ai";
import { z } from "zod";
import { requireFor, type Actor } from "@/app/lib/auth/actor";
import { searchGuides, type GuideSearchHit } from "@/app/lib/guides/search";
import { actorContextSchema } from "../context";
import { GUIDE_TOOL_PERMISSIONS } from "../tool-permissions";
import {
  guidesUnavailable,
  guidesVisibleTo,
  type GuideToolDeps,
} from "./guide-access";
import {
  describeToolError,
  toolFailure,
  type ToolResult,
} from "./tool-result";

/** Enough to pick the right guide from; the model reads one, not five. */
export const SEARCH_GUIDES_LIMIT = 5;

/** Longer than a Help page query: the model words a whole question. */
const QUERY_MAX_LENGTH = 200;

export type SearchGuidesOutput = ToolResult<{ results: GuideSearchHit[] }>;

/**
 * The search, apart from the tool so a test can call it with any actor and
 * its own guides. Only the guides the actor can see are searched, so a hidden
 * guide never takes a place in the results.
 */
export async function runSearchGuides(
  { query }: { query: string },
  actor: Actor,
  { loadGuides, log }: GuideToolDeps = {},
): Promise<SearchGuidesOutput> {
  try {
    for (const permission of GUIDE_TOOL_PERMISSIONS) {
      requireFor(actor, permission);
    }
    const visible = await guidesVisibleTo(actor, loadGuides);
    if (!visible) return guidesUnavailable();
    const results = searchGuides(query.slice(0, QUERY_MAX_LENGTH), visible, {
      surface: "assistant",
      limit: SEARCH_GUIDES_LIMIT,
      log,
    });
    return { ok: true, results };
  } catch (error) {
    return toolFailure(describeToolError(error));
  }
}

export const searchGuidesTool = tool({
  description:
    "Search the shelter app's staff guides: step-by-step instructions for " +
    "doing things in this app (recording a vaccine, scheduling care, " +
    "voiding an entry). Use it for any \"how do I…\" or \"where do I…\" " +
    "question about the app. Pass the task in a few plain words, e.g. " +
    "\"record rabies vaccine\": the task only, never a person's or " +
    "animal's name, an email, a phone or chip number, or an id. Guides " +
    "don't name anyone, and a search no guide answers is logged as " +
    "written. Returns up to five guides, best match " +
    "first, each with its slug, title and one-line summary; then call " +
    "readGuide with the best match's slug. An empty list means no guide " +
    "covers it.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The task, in a few plain words, e.g. \"record rabies vaccine\". " +
          "No names, emails, phone or chip numbers, or ids.",
      ),
  }),
  contextSchema: actorContextSchema,
  execute: (input, { context }) => runSearchGuides(input, context),
});
