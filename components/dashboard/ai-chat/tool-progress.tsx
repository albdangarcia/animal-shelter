"use client";

import { useEffect, useState } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import type { ActiveStep } from "@/app/lib/ai/chat-progress";

/** A step running longer than this earns an explicit acknowledgement. */
const LONG_STEP_SECONDS = 10;

/**
 * How long this indicator has been on screen.
 *
 * The clock has to measure *this* step, not the whole turn — a fast third
 * lookup after two slow ones should not inherit their elapsed time. That reset
 * comes from the caller keying the component on the step id, so a new step
 * mounts a fresh component and the interval starts over. Keeping the reset in
 * the key rather than in an effect is what lets the effect only ever subscribe.
 */
function useStepSeconds(): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return seconds;
}

/**
 * The in-place progress indicator: one line, under the user's message, that
 * updates as steps progress and is replaced by the answer when it streams.
 *
 * Deliberately not a running log of tool calls. Once the answer arrives nobody
 * cares which lookups produced it, and a permanent log both turns the
 * transcript into machinery and makes a model that retried a tool look like it
 * fumbled.
 *
 * The moving parts matter more than they look. A full answer takes most of a
 * minute on the free tier, and something static for forty seconds is
 * indistinguishable from a hang — so the spinner always turns, and a step that
 * passes ten seconds says so in words.
 */
export function ToolProgress({ step }: { step: ActiveStep }) {
  const seconds = useStepSeconds();
  const isSlow = seconds >= LONG_STEP_SECONDS;

  return (
    <div
      className="text-muted-foreground flex items-center gap-2 py-1 text-sm"
      role="status"
      aria-live="polite"
    >
      <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>
        {step.label}…
        {isSlow && (
          <span className="text-muted-foreground/70 ml-1.5">
            still working ({seconds}s)
          </span>
        )}
      </span>
    </div>
  );
}
