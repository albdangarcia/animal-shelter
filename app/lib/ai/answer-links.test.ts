import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedGuideHref, guideSlugsFromParts } from "./answer-links";
import type { ShelterUIMessage } from "./ui-message";

type Part = ShelterUIMessage["parts"][number];

const allowed = new Set(["record-an-exam", "medical-status-glossary"]);

test("a help link for a guide a tool returned gets through, with or without an anchor", () => {
  assert.equal(
    allowedGuideHref("/dashboard/help/record-an-exam", allowed),
    "/dashboard/help/record-an-exam",
  );
  assert.equal(
    allowedGuideHref("/dashboard/help/medical-status-glossary#overdue", allowed),
    "/dashboard/help/medical-status-glossary#overdue",
  );
});

test("an anchor react-markdown has percent-encoded still gets through", () => {
  // `#überblick` as react-markdown hands it to the `a` component.
  assert.equal(
    allowedGuideHref("/dashboard/help/record-an-exam#%C3%BCberblick", allowed),
    "/dashboard/help/record-an-exam#%C3%BCberblick",
  );
  assert.equal(
    allowedGuideHref("/dashboard/help/record-an-exam#überblick", allowed),
    "/dashboard/help/record-an-exam#überblick",
  );
});

test("a help link for any other slug is refused, even a real-looking one", () => {
  assert.equal(allowedGuideHref("/dashboard/help/record-a-vaccine-test-or-treatment", allowed), null);
  assert.equal(allowedGuideHref("/dashboard/help/no-such-guide", allowed), null);
  assert.equal(allowedGuideHref("/dashboard/help/record-an-exam", new Set()), null);
});

test("external URLs, other paths, relative paths and javascript: are refused", () => {
  for (const href of [
    "https://example.com/dashboard/help/record-an-exam",
    "http://localhost:3000/dashboard/help/record-an-exam",
    "//example.com/dashboard/help/record-an-exam",
    "/dashboard/animals",
    "/dashboard/help",
    "/dashboard/help/",
    "/dashboard/help/record-an-exam/",
    "/dashboard/help/record-an-exam?x=1",
    "/dashboard/help/record-an-exam#",
    // No odd anchors here: react-markdown percent-encodes a space or a stray
    // `%` before the check sees it (`#a b` arrives as `#a%20b`), so after
    // encoding they would pass. That's fine, since an anchor only decides
    // where a real guide's page scrolls to. Each case below still fails after
    // encoding.
    "/dashboard/help/record-an-exam%0A",
    "/dashboard/help/record-an-exam#x%0Ajavascript:alert(1)?",
    "/dashboard/help/../animals",
    "dashboard/help/record-an-exam",
    "./record-an-exam.md",
    "record-an-exam",
    "javascript:alert(1)",
    "javascript:/dashboard/help/record-an-exam",
    "",
    undefined,
  ]) {
    assert.equal(allowedGuideHref(href, allowed), null, String(href));
  }
});

test("the allowed slugs are the guides the guide tools returned in the message", () => {
  const parts: Part[] = [
    { type: "step-start" },
    {
      type: "tool-searchGuides",
      toolCallId: "s1",
      state: "output-available",
      input: { query: "exam" },
      output: {
        ok: true,
        results: [{ slug: "record-an-exam", title: "Record an exam", summary: "…" }],
      },
    },
    {
      type: "tool-readGuide",
      toolCallId: "r1",
      state: "output-available",
      input: { slug: "record-an-exam" },
      output: {
        ok: true,
        guide: {
          slug: "record-an-exam",
          title: "Record an exam",
          summary: "…",
          verified: "2026-11-09",
          // A help link shown in code is text: only `linkedGuides` counts.
          body: "See [Overdue](/dashboard/help/medical-status-glossary#overdue), [due](/dashboard/help/schedule-care-and-read-the-due-page) and `[x](/dashboard/help/correct-or-void-an-entry)`.",
          related: [{ slug: "record-a-vaccine-test-or-treatment", title: "Record a vaccine" }],
          linkedGuides: ["medical-status-glossary", "schedule-care-and-read-the-due-page"],
        },
      },
    },
    // A slug the model asked for and didn't get is not allowed.
    {
      type: "tool-readGuide",
      toolCallId: "r2",
      state: "output-available",
      input: { slug: "made-up-guide" },
      output: { ok: true, guide: null },
    },
    // Nor is one a search is still running for.
    {
      type: "tool-readGuide",
      toolCallId: "r3",
      state: "input-available",
      input: { slug: "still-running" },
    },
    { type: "text", text: "Here is how." },
  ];

  assert.deepEqual(
    [...guideSlugsFromParts(parts)].sort(),
    [
      "medical-status-glossary",
      "record-a-vaccine-test-or-treatment",
      "record-an-exam",
      "schedule-care-and-read-the-due-page",
    ],
  );
});

test("a message with no guide tools allows no links", () => {
  assert.equal(guideSlugsFromParts([{ type: "text", text: "[x](/dashboard/help/record-an-exam)" }]).size, 0);
  assert.equal(
    guideSlugsFromParts([
      {
        type: "tool-searchGuides",
        toolCallId: "s1",
        state: "output-available",
        input: { query: "x" },
        output: { ok: false, reason: "The guides couldn't be loaded just now. Try again in a moment." },
      },
    ]).size,
    0,
  );
});
