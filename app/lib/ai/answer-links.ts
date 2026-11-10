/**
 * Which links in an assistant answer are real links.
 *
 * The answer is model output, so a link in it is whatever the model chose to
 * write: a made-up page, a look-alike site, `javascript:`. The rule is that a
 * link is clickable only when it opens a help page for a guide that
 * `searchGuides` or `readGuide` returned in the same message. Those tools
 * return only the guides this person can see, so the model can neither
 * invent a URL nor a plausible-looking guide URL, and can't link a guide the
 * person couldn't open. Everything else is shown as plain text. A guide link
 * opens in a new tab, so the unsaved conversation stays where it was.
 *
 * Pure and free of server imports: the chat renders it in the browser.
 */
import { HELP_PATH } from "@/app/lib/guides/help-paths";
import type { ShelterUIMessage } from "./ui-message";

type ChatPart = ShelterUIMessage["parts"][number];

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";

/**
 * `/dashboard/help/<slug>`, optionally `#anchor` with the characters a
 * heading id is made of (see `headingSlug`), each either as written or
 * percent-encoded: react-markdown encodes every href before rendering, so
 * `#überblick` arrives as `#%C3%BCberblick`. No query, no trailing slash, no
 * host: an absolute URL to this very site is still refused.
 */
const HELP_LINK = new RegExp(
  `^${HELP_PATH}/(${SLUG})(?:#(?:[\\p{L}\\p{M}\\p{N}\\p{Pc}-]|%[0-9A-Fa-f]{2})+)?$`,
  "u",
);

/**
 * The href to render as a link, or null to render the link as plain text.
 * Only `/dashboard/help/<slug>` (with an optional anchor) for a slug in
 * `allowedSlugs` gets through.
 */
export function allowedGuideHref(
  href: string | null | undefined,
  allowedSlugs: ReadonlySet<string>,
): string | null {
  if (!href) return null;
  const match = HELP_LINK.exec(href);
  return match && allowedSlugs.has(match[1]) ? href : null;
}

/**
 * Every guide slug the guide tools returned in these parts: `searchGuides`'
 * hits, and for `readGuide` the guide, its related guides and the guides its
 * body links to, as the tool reports them (`linkedGuides`). Not read from the
 * body's text, where a help link shown in code would look like a real one.
 */
export function guideSlugsFromParts(parts: readonly ChatPart[]): Set<string> {
  const slugs = new Set<string>();
  for (const part of parts) {
    if (part.type === "tool-searchGuides") {
      if (part.state === "output-available" && part.output.ok) {
        for (const hit of part.output.results) slugs.add(hit.slug);
      }
    } else if (part.type === "tool-readGuide") {
      if (
        part.state === "output-available" &&
        part.output.ok &&
        part.output.guide
      ) {
        const { guide } = part.output;
        slugs.add(guide.slug);
        for (const related of guide.related) slugs.add(related.slug);
        for (const slug of guide.linkedGuides) slugs.add(slug);
      }
    }
  }
  return slugs;
}
