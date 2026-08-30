/**
 * Normalises an assistant answer before it is rendered as Markdown.
 *
 * The renderer deliberately does not enable `rehype-raw`, so model-authored
 * HTML cannot become markup — but it does not vanish either: it lands on screen
 * as literal text. `openai/gpt-oss-120b` reaches for `<br>` inside table cells
 * routinely, and "Nail trim and ear check".<br>• Low-priority task" is exactly
 * the raw-markup failure the spec forbids, just wearing a different hat.
 *
 * Asking the model not to emit HTML is in the prompt too, but a prompt is a
 * suggestion. This is the part that holds.
 */

// `<br>`, `<br/>`, `<br />`, any casing.
const LINE_BREAK_TAG = /<br\s*\/?>/gi;

/**
 * A GFM table row. A newline inside one would terminate the row and break the
 * table, so a line break there has to become an inline separator instead.
 */
const TABLE_ROW = /^\s*\|/;

export function normalizeAnswerMarkdown(text: string): string {
  if (!text.includes("<")) return text;

  return text
    .split("\n")
    .map((line) =>
      TABLE_ROW.test(line)
        ? line.replace(LINE_BREAK_TAG, " · ")
        : line.replace(LINE_BREAK_TAG, "\n"),
    )
    .join("\n");
}
