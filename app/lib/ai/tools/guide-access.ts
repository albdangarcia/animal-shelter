import type { Actor } from "@/app/lib/auth/actor";
import { can } from "@/app/lib/auth/can";
import type { Guide } from "@/app/lib/guides/guides";
import { getGuides } from "@/app/lib/guides/store";
import {
  heldGuidePermissions,
  visibleGuides,
} from "@/app/lib/guides/visibility";
import { toolFailure, type ToolFailure } from "./tool-result";

/**
 * What the guide tools read, so a test can hand them its own guides, a
 * store that fails, or a log to look at. The tools themselves pass nothing
 * and get the real store and stdout.
 */
export type GuideToolDeps = {
  loadGuides?: () => Promise<Guide[]>;
  /** Where `searchGuides` writes its no-results line. */
  log?: (line: string) => void;
};

export const GUIDES_UNAVAILABLE =
  "The guides couldn't be loaded just now. Try again in a moment.";

/**
 * The guides this actor can see, worked out from their role the way the Help
 * page works it out from the session. `null` when the store fails to load:
 * the error is logged here and the tool returns `guidesUnavailable()`, so a
 * broken guide file costs one answer, not the chat.
 */
export async function guidesVisibleTo(
  actor: Actor,
  loadGuides: () => Promise<Guide[]> = getGuides,
): Promise<Guide[] | null> {
  let guides: Guide[];
  try {
    guides = await loadGuides();
  } catch (error) {
    console.error("The assistant couldn't load the guides.", error);
    return null;
  }
  const held = await heldGuidePermissions(guides, (permission) =>
    can(actor.role, permission),
  );
  return visibleGuides(guides, held);
}

export const guidesUnavailable = (): ToolFailure =>
  toolFailure(GUIDES_UNAVAILABLE);
