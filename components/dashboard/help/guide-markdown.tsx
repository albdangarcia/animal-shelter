import Link from "next/link";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  guideHref,
  isExternalHref,
  parseGuideLink,
  remarkHeadingIds,
} from "@/app/lib/guides/markdown";

// Anchored headings clear the sticky site header when a link scrolls to them.
const ANCHORED = "scroll-mt-20";

const components: Components = {
  // Guides have no `#` heading (the title is the page's h1), but one would
  // still sit below it.
  h1: ({ id, children }) => (
    <h2 id={id} className={`${ANCHORED} text-xl font-semibold`}>
      {children}
    </h2>
  ),
  h2: ({ id, children }) => (
    <h2 id={id} className={`${ANCHORED} pt-2 text-lg font-semibold`}>
      {children}
    </h2>
  ),
  h3: ({ id, children }) => (
    <h3 id={id} className={`${ANCHORED} text-base font-semibold`}>
      {children}
    </h3>
  ),
  h4: ({ id, children }) => (
    <h4 id={id} className={`${ANCHORED} font-semibold`}>
      {children}
    </h4>
  ),
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-6 [&_ul]:mt-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-6 [&_ol]:mt-1">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  code: ({ children }) => (
    <code className="bg-muted rounded px-1 py-0.5 font-mono text-sm">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-muted overflow-x-auto rounded p-3 [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-border text-muted-foreground border-l-4 pl-4">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">{children}</table>
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
  a: ({ href = "", children }) => {
    const className = "text-primary underline underline-offset-4";
    if (parseGuideLink(href)) {
      return (
        <Link href={guideHref(href)} className={className}>
          {children}
        </Link>
      );
    }
    if (isExternalHref(href)) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {children}
        </a>
      );
    }
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
};

/**
 * A guide body. `react-markdown` builds React elements and shows any HTML as
 * text; `rehype-raw` is not added and must not be. Links between guides
 * (`./<slug>.md#anchor`) open the help page, headings get the ids those
 * anchors name, and links to other sites open in a new tab.
 *
 * A server component: the guide arrives as HTML, and the markdown parser
 * stays out of the browser bundle.
 */
export function GuideMarkdown({ body }: { body: string }) {
  return (
    <div className="space-y-4 leading-relaxed">
      <Markdown
        remarkPlugins={[remarkGfm, remarkHeadingIds]}
        components={components}
      >
        {body}
      </Markdown>
    </div>
  );
}
