import Link from "next/link";
import { MessageCircleQuestionMark } from "lucide-react";
import StatusPage from "@/components/StatusPage";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HelpSearch } from "@/components/dashboard/help/help-search";
import { getVisibleGuides } from "@/app/lib/data/guides.data";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  HELP_QUERY_MAX_LENGTH,
  helpGuidePath,
} from "@/app/lib/guides/help-paths";
import { searchGuides, type GuideSearchHit } from "@/app/lib/guides/search";
import { sortByTitle } from "@/app/lib/guides/visibility";

const Page = async ({ searchParams }: PageProps<"/dashboard/help">) => {
  const visible = await getVisibleGuides();
  // The sidebar offers Help only to readers who can see a guide. The page
  // holds the same line, as Settings does.
  if (visible.length === 0) {
    return <StatusPage type="accessDenied" />;
  }

  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q ?? "")
    .trim()
    .slice(0, HELP_QUERY_MAX_LENGTH);

  const guides: GuideSearchHit[] = query
    ? searchGuides(query, visible, { surface: "help" })
    : sortByTitle(visible);

  // A search that found nothing can go to the assistant, which reads the
  // same guides and can say so plainly when none covers the question.
  // Fosters don't hold AI_CHAT_USE, so they never see the offer.
  const canAskAssistant =
    guides.length === 0 && (await hasPermission(AppPermissions.AI_CHAT_USE));

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          <h1>Help</h1>
        </CardTitle>
        <CardDescription>
          Step-by-step guides for the tasks you can do in the app.
        </CardDescription>
        <div className="mt-4">
          <HelpSearch />
        </div>
      </CardHeader>
      <CardContent>
        {guides.length > 0 ? (
          <ul
            aria-label={query ? "Matching guides" : "Guides"}
            className="divide-border divide-y"
          >
            {guides.map((guide) => (
              <li key={guide.slug} className="py-3 first:pt-0">
                <Link
                  href={helpGuidePath(guide.slug)}
                  className="font-medium hover:underline"
                >
                  {guide.title}
                </Link>
                <p className="text-muted-foreground text-sm">{guide.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div role="status" className="rounded-lg border-2 border-dashed px-6 py-12 text-center">
            <p className="text-lg font-semibold">
              No guides match “{query}”.
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Try other words, such as the name of the button or page.
            </p>
            {canAskAssistant && (
              <Button asChild variant="outline" className="mt-4">
                {/* The chat fills its message box with the query and waits,
                    so the question can be reworded before it's sent. */}
                <Link href={`/dashboard/ai-chat?${new URLSearchParams({ q: query })}`}>
                  <MessageCircleQuestionMark aria-hidden="true" />
                  Ask the assistant
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Page;
