"use client";

import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import {
  declineText,
  describeEntryChanges,
} from "@/app/lib/utils/medical-entry-changes";
import {
  MedicalEntryEventAction,
  MedicalEntryStatus,
} from "@/prisma/generated/enums";
import { ChangeHistory } from "./change-history";

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
    <ChangeHistory
      created={
        created && {
          verb: createdVerb,
          actorName: created.actor.name,
          createdAt: created.createdAt,
        }
      }
      later={later.map((event) => ({
        id: event.id,
        verb:
          isExemptionEvent(event) && event.action === MedicalEntryEventAction.DECLINED
            ? "Declined as an exemption"
            : EVENT_VERB[event.action as keyof typeof EVENT_VERB],
        actorName: event.actor.name,
        createdAt: event.createdAt,
        reason:
          event.action === MedicalEntryEventAction.VOIDED ||
          event.action === MedicalEntryEventAction.DECLINED
            ? (reasonOf(event) ?? "")
            : null,
        changes:
          event.action === MedicalEntryEventAction.EDITED ||
          event.action === MedicalEntryEventAction.RESCHEDULED
            ? describeEntryChanges(event.before, event.after, names)
            : [],
      }))}
    />
  );
}
