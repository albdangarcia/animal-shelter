// Staff guides: markdown files in docs/guides/ with YAML front matter.
//
// No auth and no next/* imports: the help page, the command palette and the
// assistant tools all reuse this module, and the unit test that checks every
// guide runs it under plain node.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";

export type GuidePermission = keyof typeof AppPermissions;

export type Guide = {
  slug: string;
  title: string;
  summary: string;
  /** A reader sees the guide if they hold any of these. */
  permissions: GuidePermission[];
  aliases: string[];
  related: string[];
  /** YYYY-MM-DD: the day someone last walked the steps in the app. */
  verified: string;
  /** The markdown after the front matter. */
  body: string;
};

/** The authoring reference in docs/guides/, not a guide. */
export const GUIDES_README = "README.md";

export const SUMMARY_MAX_LENGTH = 160;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const NO_EVERYONE =
  "list at least one AppPermissions key (there is no value for everyone)";

const permissionKeys = Object.keys(AppPermissions) as [
  GuidePermission,
  ...GuidePermission[],
];

function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/**
 * The latest calendar date anywhere on earth (UTC+14), so a guide verified
 * "today" in the author's own time zone never reads as in the future.
 */
function latestDateToday(now: Date): string {
  return new Date(now.getTime() + 14 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * `required` when the field is missing or left empty (`title:` reads as
 * null), `wrongType` when it holds something else.
 */
const missingOr =
  (required: string, wrongType: string) => (issue: { input?: unknown }) =>
    issue.input == null ? required : wrongType;

function frontMatterSchema(today: string) {
  return z.strictObject({
    title: z
      .string({ error: missingOr("title is required", "title must be text") })
      .trim()
      .min(1, "title must not be empty"),
    summary: z
      .string({
        error: missingOr("summary is required", "summary must be text"),
      })
      .trim()
      .min(1, "summary must not be empty")
      .max(
        SUMMARY_MAX_LENGTH,
        `summary must be at most ${SUMMARY_MAX_LENGTH} characters`,
      )
      .refine((value) => !/[\r\n]/.test(value), "summary must be one line"),
    permissions: z
      .array(
        z.enum(permissionKeys, {
          error: (issue) =>
            `unknown permission ${JSON.stringify(issue.input)}: use a key ` +
            "of AppPermissions (app/lib/auth/permissions.ts)",
        }),
        {
          error: missingOr(
            `permissions is required: ${NO_EVERYONE}`,
            "permissions must be a list, such as [MEDICAL_READ]",
          ),
        },
      )
      .min(1, `permissions must ${NO_EVERYONE}`)
      .refine(
        (keys) => new Set(keys).size === keys.length,
        "permissions lists the same key twice",
      ),
    aliases: z
      .array(z.string().trim().min(1, "aliases must not hold empty entries"), {
        error: "aliases must be a list",
      })
      .default([]),
    related: z
      .array(z.string(), { error: "related must be a list of slugs" })
      .default([]),
    verified: z
      .string({
        error: missingOr(
          "verified is required (YYYY-MM-DD)",
          "verified must be a date written YYYY-MM-DD",
        ),
      })
      .regex(DATE_PATTERN, {
        error: "verified must be a date written YYYY-MM-DD",
        abort: true,
      })
      .refine(isRealDate, { error: "verified is not a real date", abort: true })
      .refine(
        (value) => value <= today,
        `verified must not be after ${today} ` +
          "(no time zone has reached a later date yet)",
      ),
  });
}

function formatIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    return issue.keys
      .map((key) => `unknown field ${JSON.stringify(key)}`)
      .join("; ");
  }
  const field = issue.path.map(String).join(".");
  return field && !issue.message.startsWith(String(issue.path[0]))
    ? `${field}: ${issue.message}`
    : issue.message;
}

function splitFrontMatter(
  fileName: string,
  text: string,
): { yaml: string; body: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error(`${fileName}: must start with a "---" front matter block`);
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    throw new Error(`${fileName}: front matter has no closing "---"`);
  }
  return {
    yaml: lines.slice(1, end).join("\n"),
    body: lines
      .slice(end + 1)
      .join("\n")
      .trim(),
  };
}

/**
 * The YAML parser counts lines from the first line inside the front matter.
 * Shift them by the opening "---" so they match the file, and drop the code
 * frame it appends after the first line.
 */
function yamlErrorText(error: Error): string {
  return error.message
    .split("\n")[0]
    .replace(/\bline (\d+)/, (_, line: string) => `line ${Number(line) + 1}`)
    .replace(/:\s*$/, "");
}

/**
 * Parses one guide. Throws an error naming the file and the field on any
 * malformed front matter. Checks that span files are in validateGuides.
 */
export function parseGuide(
  slug: string,
  text: string,
  options: { now?: Date } = {},
): Guide {
  const fileName = `${slug}.md`;
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `${fileName}: the file name must be a lowercase kebab-case slug`,
    );
  }

  const { yaml, body } = splitFrontMatter(fileName, text);
  let data: unknown;
  try {
    data = parseYaml(yaml);
  } catch (error) {
    throw new Error(
      `${fileName}: front matter is not valid YAML: ${yamlErrorText(error as Error)}`,
    );
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${fileName}: front matter must be a set of fields`);
  }

  const today = latestDateToday(options.now ?? new Date());
  const result = frontMatterSchema(today).safeParse(data);
  if (!result.success) {
    const problems = result.error.issues.map(formatIssue).join("; ");
    throw new Error(`${fileName}: ${problems}`);
  }
  if (!body) {
    throw new Error(`${fileName}: the guide has no body`);
  }

  return { slug, ...result.data, body };
}

export type GuideLink = {
  kind: "link" | "image" | "definition";
  /** The target as the renderer reads it, escapes and <…> resolved. */
  url: string;
};

/**
 * Parses a guide body as GitHub-flavoured markdown, as the help page renders
 * it, and returns its links, images and link definitions, and any raw HTML.
 * Links in code are left out, reference links are found through their
 * definitions, and footnotes aren't links.
 */
function scanBody(body: string): { links: GuideLink[]; html: string[] } {
  const links: GuideLink[] = [];
  const html: string[] = [];
  const visit = (node: Nodes) => {
    if (
      node.type === "link" ||
      node.type === "image" ||
      node.type === "definition"
    ) {
      links.push({ kind: node.type, url: node.url });
    } else if (node.type === "html") {
      html.push(node.value);
    }
    if ("children" in node) node.children.forEach(visit);
  };
  visit(
    fromMarkdown(body, {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    }),
  );
  return { links, html };
}

/** Every link, image and link definition in a guide body. */
export function guideLinks(body: string): GuideLink[] {
  return scanBody(body).links;
}

const GUIDE_LINK_PATTERN = /^\.\/([^/#?]+)\.md(?:#.*)?$/;

/**
 * Why a link target isn't allowed, or null when it is. Guides link to other
 * guides as `./<slug>.md`, to web pages over http(s), to mail addresses and
 * to their own headings. Anything else would be a dead link on the help page
 * (react-markdown empties other schemes) or on GitHub (an app path), or would
 * skip the permission check (an app path).
 */
function targetIssue(url: string): string | null {
  if (/^(?:https?:\/\/|mailto:|#)/i.test(url)) return null;
  if (url.startsWith("//")) {
    return "a link to another site must start with https://";
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return "only https://, http:// and mailto: links are allowed";
  }
  if (url.startsWith("/")) {
    return (
      "links to app pages aren't allowed: they break on GitHub and aren't " +
      "checked against the guide's permissions. Name the page in words " +
      "(Medical, then Due)"
    );
  }
  return GUIDE_LINK_PATTERN.test(url) ? null : "must be written ./<slug>.md";
}

/**
 * The problems that span files: unique slugs, every `related` slug exists,
 * every link is allowed and every link to a guide points at a real one that
 * everyone who can see the linking guide can see too, and no images or raw
 * HTML. `knownSlugs` adds guides that exist but failed to parse, so they
 * aren't also reported as missing.
 */
function crossFileProblems(
  guides: Guide[],
  knownSlugs: Iterable<string> = [],
): string[] {
  const problems: string[] = [];
  const bySlug = new Map<string, Guide>();
  for (const guide of guides) {
    if (bySlug.has(guide.slug)) {
      problems.push(`${guide.slug}.md: duplicate slug "${guide.slug}"`);
    }
    bySlug.set(guide.slug, guide);
  }
  const exists = new Set([...bySlug.keys(), ...knownSlugs]);

  for (const guide of guides) {
    const fileName = `${guide.slug}.md`;
    for (const related of guide.related) {
      if (related === guide.slug) {
        problems.push(`${fileName}: related lists the guide itself`);
      } else if (!exists.has(related)) {
        problems.push(`${fileName}: related "${related}" is not a guide`);
      }
    }
    const { links, html } = scanBody(guide.body);
    for (const value of html) {
      problems.push(
        `${fileName}: raw HTML ${JSON.stringify(value)}: guides are plain markdown`,
      );
    }
    for (const { kind, url } of links) {
      if (kind === "image") {
        problems.push(
          `${fileName}: image "${url}": guides are text only, with no images`,
        );
        continue;
      }
      const issue = targetIssue(url);
      if (issue) {
        problems.push(`${fileName}: link "${url}": ${issue}`);
        continue;
      }
      const match = GUIDE_LINK_PATTERN.exec(url);
      if (!match) continue;
      if (!exists.has(match[1])) {
        problems.push(`${fileName}: link "${url}" points at no guide`);
        continue;
      }
      const target = bySlug.get(match[1]);
      if (target) {
        problems.push(...visibilityProblem(guide, target, url));
      }
    }
  }
  return problems;
}

/**
 * Whoever can see `guide` must be able to follow its link to `target`: the
 * target lists every permission `guide` does, whatever roles hold. Adding
 * permissions to the target widens who sees it, so the message offers that
 * last, and `related` (which shows each reader only what they can open)
 * first.
 */
function visibilityProblem(
  guide: Guide,
  target: Guide,
  url: string,
): string[] {
  const missing = guide.permissions.filter(
    (key) => !target.permissions.includes(key),
  );
  if (missing.length === 0) return [];
  const holders = missing.join(" or ");
  return [
    `${guide.slug}.md: link "${url}" points at a guide that readers with ${holders} ` +
      `but none of ${target.permissions.join(", ")} can't see. Drop the link ` +
      `(list "${target.slug}" in related instead: each reader only sees the related ` +
      `guides they can open), or add ${missing.join(", ")} to ${target.slug}.md only ` +
      `if everyone holding ${missing.length === 1 ? "it" : "them"} should see that guide`,
  ];
}

/**
 * Checks that span files: unique slugs, every `related` slug exists, every
 * link is allowed and every link to a guide points at one its readers can
 * see, and no images or raw HTML. Throws one error listing every problem.
 */
export function validateGuides(guides: Guide[]): void {
  const problems = crossFileProblems(guides);
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
}

/**
 * Reads every guide in `dir`, parses each and validates them together.
 * README.md and names starting with a dot (.DS_Store, a draft kept out of
 * the check) are skipped. Anything else that isn't a plain `<slug>.md` file
 * is a problem, so a guide saved as `.markdown` isn't silently left out.
 * Throws one error listing every problem in every file.
 */
export async function loadGuides(
  dir: string,
  options: { now?: Date } = {},
): Promise<Guide[]> {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter(
      (entry) => entry.name !== GUIDES_README && !entry.name.startsWith("."),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const guides: Guide[] = [];
  const knownSlugs: string[] = [];
  const problems: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      const what = entry.isDirectory() ? "a folder" : "a link";
      problems.push(`${entry.name}: must be a plain file, not ${what}`);
      continue;
    }
    if (!entry.name.endsWith(".md")) {
      problems.push(
        `${entry.name}: only guides (<slug>.md) and ${GUIDES_README} ` +
          "belong in this folder",
      );
      continue;
    }
    const slug = entry.name.slice(0, -".md".length);
    knownSlugs.push(slug);
    const text = await readFile(path.join(dir, entry.name), "utf8");
    try {
      guides.push(parseGuide(slug, text, options));
    } catch (error) {
      problems.push((error as Error).message);
    }
  }
  problems.push(...crossFileProblems(guides, knownSlugs));

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return guides;
}
