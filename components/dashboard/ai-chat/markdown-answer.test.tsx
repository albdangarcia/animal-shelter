import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { MarkdownAnswer } from "./markdown-answer";

// What the chat shows for a link in the model's answer. The rule itself
// (allowedGuideHref) is unit-tested in app/lib/ai/answer-links.test.ts; this
// checks it on the href react-markdown actually hands the `a` component,
// which has been percent-encoded on the way.

const guideSlugs = new Set(["record-an-exam", "medical-status-glossary"]);

test("a link to a guide a tool returned opens its help page in a new tab, keeping the chat", async () => {
  await render(
    <MarkdownAnswer
      text="See [Record an exam](/dashboard/help/record-an-exam) and [Overdue](/dashboard/help/medical-status-glossary#overdue)."
      guideSlugs={guideSlugs}
    />,
  );
  const exam = page.getByRole("link", { name: "Record an exam" });
  await expect.element(exam).toHaveAttribute("href", "/dashboard/help/record-an-exam");
  await expect.element(exam).toHaveAttribute("target", "_blank");
  await expect.element(exam).toHaveAttribute("rel", "noopener noreferrer");
  await expect
    .element(page.getByRole("link", { name: "Overdue" }))
    .toHaveAttribute("href", "/dashboard/help/medical-status-glossary#overdue");
});

test("an anchor outside ASCII still links, as react-markdown encodes it", async () => {
  await render(
    <MarkdownAnswer
      text="See [the overview](/dashboard/help/record-an-exam#überblick)."
      guideSlugs={guideSlugs}
    />,
  );
  await expect
    .element(page.getByRole("link", { name: "the overview" }))
    .toHaveAttribute("href", "/dashboard/help/record-an-exam#%C3%BCberblick");
});

test("every other link is plain text", async () => {
  await render(
    <MarkdownAnswer
      text={[
        "[a made-up guide](/dashboard/help/record-a-vaccine-test-or-treatment)",
        "[a look-alike](https://example.com/dashboard/help/record-an-exam)",
        "[an app page](/dashboard/animals)",
        "[a script](javascript:alert(1))",
      ].join(" · ")}
      guideSlugs={guideSlugs}
    />,
  );
  for (const name of ["a made-up guide", "a look-alike", "an app page", "a script"]) {
    await expect.element(page.getByText(name)).toBeVisible();
  }
  expect(page.getByRole("link").elements()).toHaveLength(0);
});

test("with no guide tool in the message, even a real guide link is text", async () => {
  await render(<MarkdownAnswer text="[Record an exam](/dashboard/help/record-an-exam)" />);
  await expect.element(page.getByText("Record an exam")).toBeVisible();
  expect(page.getByRole("link").elements()).toHaveLength(0);
});
