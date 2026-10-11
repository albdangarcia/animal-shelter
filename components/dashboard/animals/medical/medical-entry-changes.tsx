"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/common/time-ago";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import { describeEntryChanges } from "@/app/lib/utils/medical-entry-changes";

interface Props {
  events: MedicalEntryDisplay["events"];
  /** Names for the ids the events hold, keyed by id. */
  names: Record<string, string>;
}

/**
 * Who recorded the entry, and behind a toggle every change made since: who,
 * when, and each field's value before and after, or why it was voided.
 */
export function MedicalEntryChanges({ events, names }: Props) {
  const [open, setOpen] = useState(false);
  const created = events.find((event) => event.action === "CREATED");
  const later = events.filter((event) => event.action !== "CREATED");

  return (
    <div className="mt-3 border-t pt-2 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-2">
        {created && (
          <span>
            Recorded by {created.actor.name} <TimeAgo date={created.createdAt} />
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
                {event.action === "VOIDED" ? "Voided" : "Edited"} by{" "}
                {event.actor.name} <TimeAgo date={event.createdAt} />
                {event.action === "VOIDED" &&
                  `: ${(event.after as { voidReason?: string } | null)?.voidReason ?? ""}`}
              </p>
              {event.action === "EDITED" && (
                <ul className="ml-4 list-disc">
                  {describeEntryChanges(event.before, event.after, names).map(
                    (change) => (
                      <li key={change.field}>
                        {change.label}: {change.from} → {change.to}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
