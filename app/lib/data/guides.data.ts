// The signed-in user's guides: the auth-free modules in app/lib/guides/,
// given the permissions this request's user holds.
import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import type { Guide } from "@/app/lib/guides/guides";
import type { HelpLinkGuide } from "@/app/lib/guides/help-paths";
import { getGuides } from "@/app/lib/guides/store";
import {
  heldGuidePermissions,
  helpLinkGuide,
  visibleGuides,
} from "@/app/lib/guides/visibility";

/** The guides the signed-in user can see, read once per request. */
export const getVisibleGuides = cache(async (): Promise<Guide[]> => {
  const guides = await getGuides();
  return visibleGuides(guides, await heldGuidePermissions(guides, hasPermission));
});

/**
 * The guide a page's "?" link opens, or null when the user can't see it (or
 * the guides failed to load), so the page shows no link. Errors Next throws
 * on purpose, such as from `headers()` while prerendering, go back to Next.
 */
export function getHelpLinkGuide(slug: string): Promise<HelpLinkGuide | null> {
  return helpLinkGuide(getVisibleGuides, slug, (error) => {
    unstable_rethrow(error);
    console.error("Error loading guides for a help link:", error);
  });
}
