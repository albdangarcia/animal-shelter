"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeAnswerMarkdown } from "@/app/lib/ai/answer-markdown";

/**
 * Renders an assistant answer as markdown.
 *
 * The model emits markdown whether or not we ask it to — answers came
 * back with `###` headings, `**bold**`, two-level nested bullets and italics —
 * and a 12-animal attention queue is only scannable because of that structure.
 * Shipping the raw string would put literal asterisks and hashes on screen;
 * stripping the syntax would flatten the one thing making the answer readable.
 *
 * Sanitisation is structural rather than a filtering pass: `react-markdown`
 * produces React elements and escapes embedded HTML unless `rehype-raw` is
 * added. It is not added, and must not be — there is no `dangerouslySetInnerHTML`
 * anywhere in this path, so model output cannot become markup.
 *
 * The flip side is that HTML the model does emit shows up as literal text, so
 * the answer is normalised first (see `normalizeAnswerMarkdown`).
 */
export function MarkdownAnswer({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed [&>*+*]:mt-3">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h3 className="text-sm font-semibold">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-sm font-semibold">{children}</h3>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold">{children}</h4>
          ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5 [&_ul]:mt-1 [&_ul]:space-y-0.5">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          code: ({ children }) => (
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              {children}
            </code>
          ),
          hr: () => <hr className="border-border" />,
          // The tools return no URLs, so a link means the model invented one.
          // Rendered as plain text rather than something clickable.
          a: ({ children }) => <span className="underline">{children}</span>,
          // Wide tables must scroll inside the bubble, not stretch it.
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-border border-b px-2 py-1 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-border/50 border-b px-2 py-1">{children}</td>
          ),
        }}
      >
        {normalizeAnswerMarkdown(text)}
      </Markdown>
    </div>
  );
}
