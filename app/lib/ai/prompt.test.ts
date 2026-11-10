import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import { buildSystemPrompt, GUIDE_RULES } from "./prompt";
import type { AiToolName } from "./tool-names";

const prompt = (availableTools: AiToolName[]) =>
  buildSystemPrompt({
    actor: { userId: "u1", personId: "p1", role: "STAFF" },
    displayName: "Sam",
    availableTools,
    today: calendarDay("2026-11-10"),
  });

const hasGuideRules = (text: string) =>
  GUIDE_RULES.every((line) => text.includes(line));

test("the guide rules are in the prompt when the request carries the guide tools", () => {
  const text = prompt(["findAnimals", "searchGuides", "readGuide"]);
  assert.ok(hasGuideRules(text));
  // The link format the chat lets through (see allowedGuideHref).
  assert.match(text, /\[Guide title\]\(\/dashboard\/help\/<slug>\)/);
  assert.match(text, /do not make up steps/);
});

test("without the guide tools the prompt says nothing about guides", () => {
  for (const tools of [
    ["findAnimals", "getAttentionQueue"],
    ["findAnimals", "searchGuides"],
  ] as AiToolName[][]) {
    const text = prompt(tools);
    assert.ok(!GUIDE_RULES.some((line) => text.includes(line)));
    assert.doesNotMatch(text, /readGuide|\/dashboard\/help/);
  }
});
