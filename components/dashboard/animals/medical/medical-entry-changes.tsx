"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/common/time-ago";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import {
  declineText,
  describeEntryChanges,
} from "@/app/lib/utils/medical-entry-changes";
import {
  MedicalEntryEventAction,
  MedicalEntryStatus,
} from "@/prisma/generated/enums";

type EntryEvent = MedicalEntryDisplay["events"][number];

// What each later event reads as, before its actor.
const EVENT_VERB: Record<Exclude<EntryEvent["action"], "CREATED">, string> = {
  EDITED: "Edited",
  VOIDED: "Voided",
  COMPLETED: "Recorded as given",
  RESCHEDULED: "Rescheduled",
  DECLINED: "Declined",
};

/** The reason a void or a decline stored, from its event's `after`. */
const reasonOf = (event: EntryEvent) =>
  event.action === MedicalEntryEventAction.VOIDED
    ? (event.after as { voidReason?: string } | null)?.voidReason
    : declineText(event.after);

/** Whether a decline was of a spay or neuter, as an exemption. */
const isExemptionEvent = (event: EntryEvent) =>
  !!(event.after as { exemptionReason?: string } | null)?.exemptionReason;

interface Props {
  events: MedicalEntryDisplay["events"];
  /** Names for the ids the events hold, keyed by id. */
  names: Record<string, string>;
}

/**
 * Who recorded or scheduled the entry, and behind a toggle every change made
 * since: who, when, and each field's value before and after, or why it was
 * voided or declined.
 */
export function MedicalEntryChanges({ events, names }: Props) {
  const [open, setOpen] = useState(false);
  const created = events.find(
    (event) => event.action === MedicalEntryEventAction.CREATED,
  );
  const later = events.filter(
    (event) => event.action !== MedicalEntryEventAction.CREATED,
  );
  const createdStatus = (created?.after as { status?: string } | null)?.status;
  // An exemption recorded on its own is written declined.
  const createdVerb =
    createdStatus === MedicalEntryStatus.SCHEDULED
      ? "Scheduled"
      : createdStatus === MedicalEntryStatus.DECLINED
        ? "Exemption recorded"
        : "Recorded";

  return (
    <div className="mt-3 border-t pt-2 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-2">
        {created && (
          <span>
            {createdVerb} by {created.actor.name}{" "}
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
                {isExemptionEvent(event) &&
                event.action === MedicalEntryEventAction.DECLINED
                  ? "Declined as an exemption"
                  : EVENT_VERB[event.action as keyof typeof EVENT_VERB]}{" "}
                by{" "}
                {event.actor.name} <TimeAgo date={event.createdAt} />
                {(event.action === MedicalEntryEventAction.VOIDED ||
                  event.action === MedicalEntryEventAction.DECLINED) &&
                  `: ${reasonOf(event) ?? ""}`}
              </p>
              {(event.action === MedicalEntryEventAction.EDITED ||
                event.action === MedicalEntryEventAction.RESCHEDULED) && (
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
