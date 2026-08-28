"use client";

import { useEffect, useRef } from "react";
import { IconArrowUp, IconPlayerStopFilled } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The composer. Enter sends, Shift+Enter starts a new line, and the field is
 * disabled while a turn is in flight — a second question mid-stream would be
 * appended to a conversation the model is still answering.
 *
 * Autosizes up to a ceiling, after which it scrolls: an unbounded textarea can
 * push the send button off a short viewport.
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow to fit the draft; the ceiling is CSS (`max-h` below), because it has
  // to be viewport-relative — a 10rem textarea is fine on a laptop and eats a
  // phone's entire remaining screen once the keyboard is up. `max-height` wins
  // over an inline `height`, so the element caps itself and scrolls.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <form
      className="bg-background flex items-end gap-2 rounded-xl border p-2 shadow-xs"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <Textarea
        ref={textareaRef}
        value={value}
        rows={1}
        disabled={isStreaming}
        placeholder="Ask about an animal, a task, or today's priorities…"
        aria-label="Message the shelter assistant"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSend) onSubmit();
          }
        }}
        className="max-h-[min(10rem,25dvh)] min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      {isStreaming ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={onStop}
          aria-label="Stop generating"
        >
          <IconPlayerStopFilled />
        </Button>
      ) : (
        <Button type="submit" size="icon" disabled={!canSend} aria-label="Send">
          <IconArrowUp />
        </Button>
      )}
    </form>
  );
}
