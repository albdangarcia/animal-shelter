// How a guide body becomes a help page: heading ids, and where its links go.
//
// No auth and no next/* imports, like the rest of app/lib/guides: the loader
// checks anchors with the same ids the help page renders, and the assistant's
// `readGuide` tool links guides the same way.
import type { Heading, Link, Nodes, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { toString } from "mdast-util-to-string";
import { gfm } from "micromark-extension-gfm";
import { helpGuidePath } from "./help-paths";

/**
 * A heading's id, the way GitHub makes one, so an anchor works both on
 * GitHub and on the help page: lower case, punctuation dropped (letters,
 * digits, `_` and `-` kept, in any script), spaces turned into `-`.
 * "Active, Chronic, Resolved" becomes `active-chronic-resolved`.
 */
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/**
 * The id of every heading in the tree, in document order. A repeated heading
 * gets `-1`, `-2` and so on, as on GitHub.
 */
function assignHeadingIds(tree: Root): Array<{ node: Heading; id: string }> {
  const seen = new Map<string, number>();
  const result: Array<{ node: Heading; id: string }> = [];
  const visit = (node: Nodes) => {
    if (node.type === "heading") {
      const base = headingSlug(toString(node));
      let id = base;
      let count = seen.get(base) ?? 0;
      while (seen.has(id)) {
        count += 1;
        id = `${base}-${count}`;
      }
      seen.set(base, count);
      seen.set(id, 0);
      result.push({ node, id });
    }
    if ("children" in node) node.children.forEach(visit);
  };
  visit(tree);
  return result;
}

/** The ids the help page gives the headings in this parsed body. */
export function headingIds(tree: Root): string[] {
  return assignHeadingIds(tree).map(({ id }) => id);
}

/**
 * A remark plugin that gives every heading its id, so `#missed` and
 * `./medical-status-glossary.md#missed` land on the heading.
 */
export function remarkHeadingIds() {
  return (tree: Root) => {
    for (const { node, id } of assignHeadingIds(tree)) {
      const data = (node.data ?? {}) as {
        hProperties?: Record<string, unknown>;
      };
      node.data = { ...data, hProperties: { ...data.hProperties, id } };
    }
  };
}

/** `./<slug>.md` or `./<slug>.md#anchor`, the only way guides link guides. */
export const GUIDE_LINK_PATTERN = /^\.\/([^/#?]+)\.md(?:#(.*))?$/;

/** The guide a link points at, and the anchor, or null if it isn't one. */
export function parseGuideLink(
  url: string,
): { slug: string; anchor: string | null } | null {
  const match = GUIDE_LINK_PATTERN.exec(url);
  if (!match) return null;
  return { slug: match[1], anchor: match[2] ?? null };
}

/** An anchor as written in a link, percent-escapes resolved. */
export function decodeAnchor(anchor: string): string {
  try {
    return decodeURIComponent(anchor);
  } catch {
    return anchor;
  }
}

/**
 * Where a guide link goes on the help page: `./<slug>.md#anchor` becomes
 * `/dashboard/help/<slug>#anchor`. Anything else is left as written.
 */
export function guideHref(url: string): string {
  const link = parseGuideLink(url);
  if (!link) return url;
  const path = helpGuidePath(link.slug);
  return link.anchor === null ? path : `${path}#${link.anchor}`;
}

/** A link to another site, which the help page opens in a new tab. */
export function isExternalHref(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * A guide body with its links between guides pointing at the help pages, for
 * a reader who isn't looking at the help page: `[the Due page](./schedule-care-and-read-the-due-page.md)`
 * becomes `[the Due page](/dashboard/help/schedule-care-and-read-the-due-page)`.
 *
 * A link to a guide `canLink` refuses (one the reader can't see) keeps its
 * text and loses the link, so the body never names a guide's slug to someone
 * who can't open it. Every other link, and all other text, is left exactly as
 * written. Only inline links are rewritten: the loader refuses a guide link
 * written as a reference (`[text][ref]`).
 *
 * `linked` is the slugs the new body links to, in order, each once: the chat
 * lets a link through only to these (see `guideSlugsFromParts`).
 */
export function rewriteGuideLinks(
  body: string,
  canLink: (slug: string) => boolean,
): { body: string; linked: string[] } {
  const tree = fromMarkdown(body, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const links: Link[] = [];
  const visit = (node: Nodes) => {
    if (node.type === "link") links.push(node);
    if ("children" in node) node.children.forEach(visit);
  };
  visit(tree);

  let result = body;
  const linked: string[] = [];
  // From the end, so each edit leaves the offsets before it valid.
  for (const link of links.reverse()) {
    const target = parseGuideLink(link.url);
    const start = link.position?.start.offset;
    const end = link.position?.end.offset;
    if (!target || start === undefined || end === undefined) continue;
    const first = link.children[0]?.position?.start.offset;
    const last = link.children.at(-1)?.position?.end.offset;
    const text =
      first === undefined || last === undefined ? "" : body.slice(first, last);
    const keep = canLink(target.slug);
    if (keep) linked.unshift(target.slug);
    const replacement = keep ? `[${text}](${guideHref(link.url)})` : text;
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return { body: result, linked: [...new Set(linked)] };
}
