import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import StatusPage from "@/components/StatusPage";
import { getCachedSession } from "@/app/lib/auth/session";
import { can } from "@/app/lib/auth/can";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { toActor } from "@/app/lib/auth/actor";
import { toolNamesForActor } from "@/app/lib/ai/tool-permissions";
import { examplesForTools } from "@/app/lib/ai/chat-examples";
import { AiChat } from "@/components/dashboard/ai-chat/ai-chat";

/**
 * The longest draft `?q=` puts in the message box. The Help page's "Ask the
 * assistant" sends at most a Help query (100 characters); this only stops a
 * hand-made URL filling the box with pages of text.
 */
const DRAFT_MAX_LENGTH = 500;

/**
 * The assistant's own route rather than a floating widget: the sidebar
 * entry is gated by the same `nav-links.config.ts` permission table as every
 * other entry, and a route gets a loading state, an error boundary, and a
 * bookmarkable URL for free.
 *
 * The nav gate hides the link. It does not protect the route — this page checks
 * `AI_CHAT_USE` itself, because a URL can be typed.
 */
const Page = async ({ searchParams }: PageProps<"/dashboard/ai-chat">) => {
  const session = await getCachedSession();

  if (!session?.user || !can(session.user.role, AppPermissions.AI_CHAT_USE)) {
    return (
      <StatusPage
        type="accessDenied"
        redirectUrl="/dashboard"
        buttonGoTo="Dashboard"
      />
    );
  }

  // The empty state's examples are filtered by the same per-request tool
  // registry the model gets, so a role that cannot have a question
  // answered is never shown it — and there is no second copy of the role
  // matrix to fall out of sync.
  const availableTools = toolNamesForActor(toActor(session.user));

  // `?q=` is a draft, from the Help page's "Ask the assistant": it goes in
  // the message box and is never sent on its own, so the person can reword
  // it or add detail first.
  const { q } = await searchParams;
  const draft = (Array.isArray(q) ? q[0] : q ?? "")
    .trim()
    .slice(0, DRAFT_MAX_LENGTH);

  return (
    /*
      The chat is sized to the viewport rather than allowed to grow, because
      the composer has to stay reachable while a 40-second answer streams. The
      subtraction is the dashboard layout's own chrome — `--header-height` from
      `SidebarProvider` plus that layout's vertical padding — rather than a
      measured constant, so it tracks the layout instead of drifting from it.

      Deliberately no `min-height`: a floor is what puts the composer under a
      phone's software keyboard. When the viewport shrinks the transcript
      shrinks with it (`min-h-0` all the way down), and the composer stays on
      screen even when there is very little screen left.
    */
    <div className="flex h-[calc(100dvh-var(--header-height)-2rem)] min-h-0 flex-col md:h-[calc(100dvh-var(--header-height)-3rem)]">
      <Card className="@container/card flex min-h-0 flex-1 flex-col">
        <CardHeader className="shrink-0">
          <CardTitle className="@[650px]/card:text-xl">AI Assistant</CardTitle>
          <CardDescription>
            Ask about animals, tasks, what needs attention today, or how to
            do something in the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <AiChat
            examples={examplesForTools(availableTools)}
            availableTools={availableTools}
            initialDraft={draft}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default Page;
