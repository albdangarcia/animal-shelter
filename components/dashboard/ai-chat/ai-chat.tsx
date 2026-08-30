"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { describeChatError } from "@/app/lib/ai/chat-errors";
import { describeActiveStep } from "@/app/lib/ai/chat-progress";
import type { ChatExample } from "@/app/lib/ai/chat-examples";
import type { AiToolName } from "@/app/lib/ai/tool-names";
import type { ShelterUIMessage } from "@/app/lib/ai/ui-message";
import { ChatComposer } from "./chat-composer";
import { ChatEmptyState } from "./chat-empty-state";
import { ChatMessage } from "./chat-message";
import { ToolProgress } from "./tool-progress";

/** Treat the transcript as "pinned to the bottom" within this many pixels. */
const STICK_TO_BOTTOM_PX = 80;

/**
 * The chat.
 *
 * History is ephemeral: it lives in this component's state and a refresh
 * loses it. Persisting it needs its own Prisma models plus an ownership and
 * retention story, and `AiActionLog` will carry the audit trail regardless, so
 * the conversation is the part that can afford to be disposable.
 *
 * `availableTools` is computed server-side from the caller's permissions by the
 * same registry the model's tool set comes from — the empty state does not get
 * its own opinion about roles.
 */
export function AiChat({
  examples,
  availableTools,
}: {
  examples: ChatExample[];
  availableTools: AiToolName[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const { messages, sendMessage, status, error, stop, regenerate, addToolApprovalResponse } =
    useChat<ShelterUIMessage>({
      transport: new DefaultChatTransport({ api: "/api/ai-chat" }),
      // After the person answers the approval card, resubmit so the tool loop
      // continues on the server (executes the write, or handles the denial).
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onFinish: ({ message }) => {
        // A tool cannot call `revalidatePath`, and the dashboard behind this
        // client component would not know a write happened. Refresh only on a
        // turn that actually changed a task — not on the turn that merely
        // *requested* approval, and not on a no-op.
        const wrote = message.parts.some(
          (part) =>
            part.type === "tool-setTaskStatus" &&
            part.state === "output-available" &&
            part.output.ok &&
            part.output.result.changed,
        );
        if (wrote) router.refresh();
      },
    });

  const isBusy = status === "submitted" || status === "streaming";
  const lastMessage = messages.at(-1);
  const activeStep = describeActiveStep({ status, messages });

  // A pending approval card holds the tool loop open server-side. Block the
  // composer until it is answered — a new question sent now would be appended
  // to a turn that has not finished.
  const awaitingApproval =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) =>
        part.type === "tool-setTaskStatus" &&
        part.state === "approval-requested",
    );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      stickToBottom.current = true;
      sendMessage({ text: trimmed });
      setInput("");
    },
    [sendMessage],
  );

  // Follow the stream, but stop following the moment the user scrolls up to
  // re-read something — yanking them back to the bottom mid-answer is worse
  // than a stale viewport.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, activeStep?.label]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
  };

  // A stream that died after some text arrived leaves a real partial answer on
  // screen. It stays — but labelled, so a truncated answer is not mistaken for
  // a complete one.
  const lastMessageHasText =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some((part) => part.type === "text" && part.text !== "");
  const showIncompleteOnLast = status === "error" && lastMessageHasText;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {messages.length === 0 ? (
          <ChatEmptyState
            examples={examples}
            onPick={send}
            disabled={isBusy || availableTools.length === 0}
          />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-1 pb-2">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                isIncomplete={
                  showIncompleteOnLast && message.id === lastMessage?.id
                }
                onApprovalRespond={(approvalId, approved) =>
                  addToolApprovalResponse({
                    id: approvalId,
                    approved,
                    // Give the model an explicit signal on a denial — without a
                    // reason it reads the declined tool call as "not confirmed
                    // yet" and re-offers instead of dropping it.
                    reason: approved
                      ? undefined
                      : "The user reviewed the confirmation and declined. Do not make this change or offer to retry it.",
                  })
                }
              />
            ))}

            {/* Keyed on the step so a new lookup restarts the "still
                working" clock instead of inheriting the previous step's. */}
            {activeStep && (
              <ToolProgress key={activeStep.key} step={activeStep} />
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mx-auto w-full max-w-3xl">
          <div className="border-destructive/40 bg-destructive/5 text-foreground flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
            <IconAlertCircle
              className="text-destructive mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <div className="flex-1">{describeChatError(error)}</div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => regenerate()}
            >
              <IconRefresh />
              Retry
            </Button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl">
        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={() => send(input)}
          onStop={stop}
          isStreaming={isBusy}
          disabled={Boolean(awaitingApproval)}
        />
        <p className="text-muted-foreground mt-2 text-center text-xs">
          {awaitingApproval
            ? "Approve or deny the change above to continue."
            : "Answers come from live shelter data. This conversation isn’t saved — refreshing clears it."}
        </p>
      </div>
    </div>
  );
}
