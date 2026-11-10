import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { helpGuidePath, type HelpLinkGuide } from "@/app/lib/guides/help-paths";

/**
 * The "?" on a page: opens the guide for the page. The page asks for the
 * guide with `getHelpLinkGuide`, which gives null when the user can't see
 * it, and then nothing renders.
 *
 * No hooks and no server-only imports, so client components (Batch entry)
 * can render it too.
 */
export function HelpLink({ guide }: { guide: HelpLinkGuide | null }) {
  if (!guide) return null;
  const label = `Help: ${guide.title}`;
  return (
    <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
      <Link href={helpGuidePath(guide.slug)} aria-label={label} title={label}>
        <CircleHelp aria-hidden="true" className="size-5" />
      </Link>
    </Button>
  );
}
