import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswerMarkdown } from "./answer-markdown";

test("a line-break tag in a table cell becomes an inline separator", () => {
  const row = "| Frisco | Dog | Task A.<br>Task B |";
  const out = normalizeAnswerMarkdown(row);
  assert.equal(out, "| Frisco | Dog | Task A. · Task B |");
  // Critically, the row is still one line — a newline here would break the table.
  assert.equal(out.split("\n").length, 1);
});

test("a line-break tag outside a table becomes a real line break", () => {
  assert.equal(
    normalizeAnswerMarkdown("First line.<br />Second line."),
    "First line.\nSecond line.",
  );
});

test("every spelling and casing of the tag is handled", () => {
  assert.equal(
    normalizeAnswerMarkdown("a<br>b<BR/>c<br />d<Br   />e"),
    "a\nb\nc\nd\ne",
  );
});

test("ordinary markdown is returned untouched", () => {
  const answer = "### Overdue\n\n*   **Leo** (Cat): due Aug 18\n\n| a | b |\n|---|---|\n| 1 | 2 |";
  assert.equal(normalizeAnswerMarkdown(answer), answer);
});

test("text containing an angle bracket that is not a tag is left alone", () => {
  assert.equal(
    normalizeAnswerMarkdown("Temperature < 38 °C and weight > 20 kg"),
    "Temperature < 38 °C and weight > 20 kg",
  );
});
