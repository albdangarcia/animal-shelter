import { test } from "node:test";
import assert from "node:assert/strict";
import type { Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import {
  guideHref,
  headingIds,
  headingSlug,
  isExternalHref,
  remarkHeadingIds,
  rewriteGuideLinks,
} from "./markdown";

const parse = (body: string): Root =>
  fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });

test("a link to a guide opens its help page, with the anchor kept", () => {
  assert.equal(guideHref("./record-an-exam.md"), "/dashboard/help/record-an-exam");
  assert.equal(
    guideHref("./medical-status-glossary.md#missed"),
    "/dashboard/help/medical-status-glossary#missed",
  );
  assert.equal(
    guideHref("./medical-status-glossary.md#active-chronic-resolved"),
    "/dashboard/help/medical-status-glossary#active-chronic-resolved",
  );
});

test("links that aren't to a guide are left as written", () => {
  for (const url of [
    "#steps",
    "https://example.com/a.md",
    "mailto:help@example.com",
    "record-an-exam.md",
    "../record-an-exam.md",
  ]) {
    assert.equal(guideHref(url), url, url);
  }
});

test("only http and https links count as another site", () => {
  assert.equal(isExternalHref("https://example.com"), true);
  assert.equal(isExternalHref("HTTP://example.com"), true);
  assert.equal(isExternalHref("mailto:help@example.com"), false);
  assert.equal(isExternalHref("./record-an-exam.md"), false);
  assert.equal(isExternalHref("#steps"), false);
});

test("heading ids follow GitHub's", () => {
  assert.equal(headingSlug("When to use this"), "when-to-use-this");
  assert.equal(headingSlug("Active, Chronic, Resolved"), "active-chronic-resolved");
  assert.equal(headingSlug("Due today"), "due-today");
  assert.equal(headingSlug("Spay/neuter: what's next?"), "spayneuter-whats-next");
  assert.equal(headingSlug("Step 2 — record it"), "step-2--record-it");
  assert.equal(headingSlug("Exempt"), "exempt");
});

test("ids come from the heading's text, and a repeated heading is numbered", () => {
  const tree = parse(
    ["## Steps", "### **Given**, `Refused`", "## Steps", "## Steps", "## Steps 1"].join("\n\n"),
  );
  assert.deepEqual(headingIds(tree), ["steps", "given-refused", "steps-1", "steps-2", "steps-1-1"]);
});

test("the remark plugin gives each heading the id the loader checks", () => {
  const tree = parse("## Due dates\n\n### Overdue\n\nText.\n\n### Missed");
  remarkHeadingIds()(tree);
  const ids = tree.children
    .filter((node) => node.type === "heading")
    .map((node) => (node.data as { hProperties?: { id?: string } }).hProperties?.id);
  assert.deepEqual(ids, ["due-dates", "overdue", "missed"]);
  assert.deepEqual(ids, headingIds(parse("## Due dates\n\n### Overdue\n\nText.\n\n### Missed")));
});

test("rewriteGuideLinks sends guide links to the help pages and leaves the rest as written", () => {
  const body = [
    "Read [the glossary](./medical-status-glossary.md#overdue) and [**Record an exam**](./record-an-exam.md).",
    "",
    "A [site](https://example.com) and `[code](./record-an-exam.md)` stay.",
  ].join("\n");
  const { body: rewritten, linked } = rewriteGuideLinks(body, () => true);
  // The slug in code is text, not a link, so it isn't linked.
  assert.deepEqual(linked, ["medical-status-glossary", "record-an-exam"]);
  assert.equal(
    rewritten,
    [
      "Read [the glossary](/dashboard/help/medical-status-glossary#overdue) and [**Record an exam**](/dashboard/help/record-an-exam).",
      "",
      "A [site](https://example.com) and `[code](./record-an-exam.md)` stay.",
    ].join("\n"),
  );
});

test("rewriteGuideLinks leaves only the text of a link to a guide it may not link", () => {
  assert.deepEqual(
    rewriteGuideLinks(
      "See [the settings](./medical-settings.md), [an exam](./record-an-exam.md) and [it again](./record-an-exam.md#steps).",
      (slug) => slug === "record-an-exam",
    ),
    {
      body: "See the settings, [an exam](/dashboard/help/record-an-exam) and [it again](/dashboard/help/record-an-exam#steps).",
      linked: ["record-an-exam"],
    },
  );
});
