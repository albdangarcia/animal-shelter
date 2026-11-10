import { tool } from "ai";
import { z } from "zod";
import { requireFor, type Actor } from "@/app/lib/auth/actor";
import type { Guide } from "@/app/lib/guides/guides";
import { rewriteGuideLinks } from "@/app/lib/guides/markdown";
import {
  findVisibleGuide,
  visibleRelated,
} from "@/app/lib/guides/visibility";
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

export type GuideForAssistant = Pick<
  Guide,
  "slug" | "title" | "summary" | "verified" | "body"
> & {
  /** The guide's related guides that the actor can see. */
  related: Array<Pick<Guide, "slug" | "title">>;
  /** The guides `body` links to, by slug. */
  linkedGuides: string[];
};

/**
 * `guide: null` for a slug the actor can't see and for one that doesn't
 * exist alike, so the model can't tell a hidden guide is there. A success
 * rather than a failure: a guessed slug is the model's mistake, and the
 * transcript's "A lookup didn't work" note is for the person.
 */
export type ReadGuideOutput = ToolResult<{ guide: GuideForAssistant | null }>;

/**
 * The read, apart from the tool so a test can call it with any actor and its
 * own guides. The body's links to other guides point at their help pages,
 * and a link to a guide the actor can't see is left as its text.
 */
export async function runReadGuide(
  { slug }: { slug: string },
  actor: Actor,
  { loadGuides }: GuideToolDeps = {},
): Promise<ReadGuideOutput> {
  try {
    for (const permission of GUIDE_TOOL_PERMISSIONS) {
      requireFor(actor, permission);
    }
    const visible = await guidesVisibleTo(actor, loadGuides);
    if (!visible) return guidesUnavailable();
    const guide = findVisibleGuide(visible, slug.trim());
    if (!guide) return { ok: true, guide: null };

    const visibleSlugs = new Set(visible.map((g) => g.slug));
    const { body, linked } = rewriteGuideLinks(guide.body, (target) =>
      visibleSlugs.has(target),
    );
    return {
      ok: true,
      guide: {
        slug: guide.slug,
        title: guide.title,
        summary: guide.summary,
        verified: guide.verified,
        body,
        linkedGuides: linked,
        related: visibleRelated(guide, visible).map((g) => ({
          slug: g.slug,
          title: g.title,
        })),
      },
    };
  } catch (error) {
    return toolFailure(describeToolError(error));
  }
}

export const readGuideTool = tool({
  description:
    "Read one staff guide by its slug, from searchGuides. Returns the " +
    "guide's title, summary, the date its steps were last checked, its " +
    "body in Markdown (steps, button and field names in bold, and \"If " +
    "something goes wrong\" with the exact error messages), and related " +
    "guides. `guide: null` means there is no such guide: search again " +
    "rather than guessing a slug.",
  inputSchema: z.object({
    slug: z
      .string()
      .describe("A guide's slug as searchGuides returned it, e.g. \"record-an-exam\"."),
  }),
  contextSchema: actorContextSchema,
  execute: (input, { context }) => runReadGuide(input, context),
});
