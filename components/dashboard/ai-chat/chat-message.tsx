"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { collectToolFailures } from "@/app/lib/ai/chat-progress";
import type { ShelterUIMessage } from "@/app/lib/ai/ui-message";
import { MarkdownAnswer } from "./markdown-answer";

/**
 * One turn in the transcript.
 *
 * Tool parts are not rendered as themselves — progress lives in the transient
 * indicator, not the history. The exception is a failure: if a lookup returned
 * `{ ok: false }` and the model recovered, the answer can read as complete
 * while resting on less than the person assumes, so the note stays.
 */
export function ChatMessage({
  message,
  isIncomplete,
}: {
  message: ShelterUIMessage;
  isIncomplete?: boolean;
}) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const failures = collectToolFailures(message.parts);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-sm break-words whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  // An assistant turn that produced only an indicator has nothing to draw yet;
  // the indicator itself is rendered by the transcript.
  if (!text && failures.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {failures.map((failure) => (
        <div
          key={failure.toolCallId}
          className="text-muted-foreground border-border bg-muted/40 flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
        >
          <IconAlertTriangle
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            <span className="font-medium">A lookup didn&apos;t work.</span>{" "}
            {failure.reason}
          </span>
        </div>
      ))}

      {text && (
        <div className="max-w-[95%]">
          <MarkdownAnswer text={text} />
          {isIncomplete && (
            <p className="text-muted-foreground mt-2 text-xs italic">
              This answer was cut off before it finished.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
