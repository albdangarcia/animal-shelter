"use client";

import { useState } from "react";
import { IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

/**
 * The one place in this chat where the person authorises something rather than
 * just reads. Deliberately unlike the ordinary progress line: bordered, amber,
 * its own heading — a write is about to happen and the card should look like it.
 *
 * The `reason` is server-resolved. The route's approval function reads the task
 * from the database and builds this text from the real title, animal, unit, and
 * *current* status — never from what the model said it would do. Rendered as
 * plain text, not markdown: it is a fact statement, not model prose.
 *
 * Approve is not auto-focused — confirming a write should take a
 * deliberate click, not an absent-minded Enter.
 */
export function ApprovalCard({
  reason,
  onRespond,
}: {
  reason: string;
  onRespond: (approved: boolean) => void;
}) {
  const [responded, setResponded] = useState(false);

  const respond = (approved: boolean) => {
    if (responded) return;
    setResponded(true);
    onRespond(approved);
  };

  return (
    <div className="border-amber-500/50 bg-amber-500/5 max-w-[95%] rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <IconAlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500"
          aria-hidden="true"
        />
        <div className="flex-1">
          <p className="text-foreground text-sm font-semibold">
            Confirm this change
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{reason}</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={responded}
              onClick={() => respond(true)}
            >
              <IconCheck />
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={responded}
              onClick={() => respond(false)}
            >
              <IconX />
              Deny
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * What the card collapses to once answered (or once an approval was auto-denied
 * server-side — a bad id, a no-op). Keeps the transcript honest about whether a
 * write happened without leaving live buttons in the history.
 */
export function ApprovalOutcome({
  approved,
  note,
}: {
  approved: boolean;
  note?: string;
}) {
  return (
    <div className="text-muted-foreground border-border bg-muted/40 flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
      {approved ? (
        <IconCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <IconX className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>
        <span className="font-medium">
          {approved ? "You approved this change." : "Change not applied."}
        </span>
        {note ? ` ${note}` : ""}
      </span>
    </div>
  );
}
