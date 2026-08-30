"use client";

import { IconFileAi } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { ChatExample } from "@/app/lib/ai/chat-examples";

/**
 * The empty state teaches the tool set.
 *
 * Nobody knows what an AI chat in a shelter app does, and an empty box with a
 * blinking cursor answers that question badly. The chips are the affordance:
 * one click populates and sends, so the first answer arrives without anyone
 * having to guess at phrasing or at what the assistant can see.
 *
 * `examples` is already filtered to what the caller's own tools can answer, so
 * this component holds no role logic of its own.
 */
export function ChatEmptyState({
  examples,
  onPick,
  disabled,
}: {
  examples: ChatExample[];
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      <div className="bg-muted text-muted-foreground rounded-full p-3">
        <IconFileAi className="size-6" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">Ask about the shelter</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          I can look up animals by name, summarise a record, and tell you what
          needs attention today. I only answer from live shelter data.
        </p>
      </div>

      {examples.length > 0 && (
        <div className="flex max-w-xl flex-wrap justify-center gap-2">
          {examples.map((example) => (
            <Button
              key={example.prompt}
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onPick(example.prompt)}
              className="h-auto rounded-full py-1.5 text-xs font-normal whitespace-normal"
            >
              {example.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
