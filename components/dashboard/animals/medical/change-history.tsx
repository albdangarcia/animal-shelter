"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/common/time-ago";

/** A field an event changed, as it reads: "Label: from → to". */
export interface ChangeHistoryField {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** One change made after a record was written. */
export interface ChangeHistoryEvent {
  id: string;
  /** What happened, before "by": "Edited", "Voided", "Closed". */
  verb: string;
  actorName: string;
  createdAt: Date;
  /** Why, for a void or a decline. */
  reason?: string | null;
  changes: ChangeHistoryField[];
}

interface Props {
  /** Who wrote the record, and how it reads: "Recorded", "Added". */
  created?: { verb: string; actorName: string; createdAt: Date } | null;
  later: ChangeHistoryEvent[];
}

/**
 * Who wrote a medical record, and behind a toggle every change made since:
 * who, when, and each field's value before and after, or why it was voided
 * or declined.
 */
export function ChangeHistory({ created, later }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t pt-2 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-2">
        {created && (
          <span>
            {created.verb} by {created.actorName}{" "}
            <TimeAgo date={created.createdAt} />
          </span>
        )}
        {later.length > 0 && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-muted-foreground"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide" : "Show"} {later.length}{" "}
            {later.length === 1 ? "change" : "changes"}
            <ChevronDown
              className={clsx("ml-1 size-4 transition-transform", open && "rotate-180")}
            />
          </Button>
        )}
      </div>
      {open && (
        <ol className="mt-2 space-y-2" aria-label="Change history">
          {later.map((event) => (
            <li key={event.id}>
              <p>
                {event.verb} by {event.actorName} <TimeAgo date={event.createdAt} />
                {event.reason != null && `: ${event.reason}`}
              </p>
              {event.changes.length > 0 && (
                <ul className="ml-4 list-disc">
                  {event.changes.map((change) => (
                    <li key={change.field}>
                      {change.label}: {change.from} → {change.to}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
