import type { ReactNode } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import { TimeAgo } from "@/components/common/time-ago";
import {
  MedicalConditionEventAction,
  MedicalConditionStatus,
  MedicalConditionType,
} from "@/prisma/generated/enums";
import {
  MEDICAL_CONDITION_STATUS_LABELS,
  MEDICAL_CONDITION_TYPE_LABELS,
} from "@/app/lib/constants/medical";
import type { MedicalConditionDisplay } from "@/app/lib/data/animals/medical-condition";
import { describeConditionChanges } from "@/app/lib/utils/condition-changes";
import { conditionSourceText } from "@/app/lib/utils/problem-list";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { ChangeHistory } from "./change-history";

const STATUS_VARIANT = {
  ACTIVE: "default",
  CHRONIC: "secondary",
  RESOLVED: "outline",
} as const;

// What each later event reads as, before its actor.
const EVENT_VERB = {
  EDITED: "Edited",
  VOIDED: "Voided",
} as const;

/** Who added a problem-list row, and every change since behind a toggle. */
export function ConditionChanges({
  events,
  names,
}: {
  events: MedicalConditionDisplay["events"];
  names: Record<string, string>;
}) {
  const created = events.find(
    (event) => event.action === MedicalConditionEventAction.CREATED,
  );
  return (
    <ChangeHistory
      created={
        created && {
          verb: "Added",
          actorName: created.actor.name,
          createdAt: created.createdAt,
        }
      }
      later={events
        .filter((event) => event.action !== MedicalConditionEventAction.CREATED)
        .map((event) => ({
          id: event.id,
          verb: EVENT_VERB[event.action as keyof typeof EVENT_VERB],
          actorName: event.actor.name,
          createdAt: event.createdAt,
          reason:
            event.action === MedicalConditionEventAction.VOIDED
              ? ((event.after as { voidReason?: string } | null)?.voidReason ?? "")
              : null,
          changes:
            event.action === MedicalConditionEventAction.EDITED
              ? describeConditionChanges(event.before, event.after, names)
              : [],
        }))}
    />
  );
}

interface Props {
  condition: MedicalConditionDisplay;
  /** Where the condition stands with its trait (`conditionTraitState`). */
  traitState?: "CITED" | "CITE" | "ADD" | null;
  /** Shown top right: the row's menu, when the viewer may use it. */
  actions?: ReactNode;
  /** Shown under the row: its change history, and what can be done from it. */
  footer?: ReactNode;
}

/**
 * One row of the problem list: what it is, its status and days, who
 * diagnosed it, the test or exam that found it, the trait it stands for, and
 * its notes. A voided row is struck through, with who voided it and why.
 */
export function ConditionItem({ condition, traitState, actions, footer }: Props) {
  const voided = !!condition.voidedAt;
  const allergy = condition.type === MedicalConditionType.ALLERGY;
  const source = condition.sourceEntry;
  const facts = [
    condition.onsetDate && `Onset ${formatShelterDayOrNA(condition.onsetDate)}`,
    condition.status === MedicalConditionStatus.RESOLVED &&
      condition.resolvedDate &&
      `Resolved ${formatShelterDayOrNA(condition.resolvedDate)}`,
    condition.diagnosedBy && `Diagnosed by ${condition.diagnosedBy}`,
  ].filter(Boolean);
  const typeLabel = MEDICAL_CONDITION_TYPE_LABELS[condition.type];

  return (
    <li
      className="border rounded-lg p-4"
      aria-label={`${condition.name}, ${typeLabel.toLowerCase()}${voided ? ", voided" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={clsx("min-w-0 flex-1", voided && "text-muted-foreground")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={clsx("text-sm font-semibold", voided && "line-through")}>
              {condition.name}
            </span>
            <Badge variant={allergy && !voided ? "destructive" : "outline"}>
              {typeLabel}
            </Badge>
            <Badge variant={STATUS_VARIANT[condition.status]}>
              {MEDICAL_CONDITION_STATUS_LABELS[condition.status]}
            </Badge>
            {voided && <Badge variant="destructive">Voided</Badge>}
          </div>

          <div className={clsx(voided && "line-through")}>
            {facts.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">{facts.join(" · ")}</p>
            )}
            {source && (
              <p className="mt-1 text-sm">
                Found on the{" "}
                <Link
                  href={`/dashboard/animals/${condition.animalId}/medical/history?kind=${source.kind}`}
                  className="underline underline-offset-4"
                >
                  {conditionSourceText(source)}
                </Link>
                {source.voidedAt && " (since voided)"}
              </p>
            )}
            {condition.characteristic && (
              <p className="mt-1 text-sm">
                <span className="text-xs text-muted-foreground">Stands for the trait: </span>
                {condition.characteristic.name}
                {condition.characteristic.deletedAt && " (retired)"}
                {traitState === "CITED" && (
                  <span className="text-muted-foreground">
                    {" "}
                    · on the animal, citing this condition
                  </span>
                )}
              </p>
            )}
            {condition.notes && (
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {condition.notes}
              </p>
            )}
          </div>

          {voided && (
            <p className="mt-2 text-sm">
              Voided by {condition.voidedBy?.name ?? "someone"}{" "}
              <TimeAgo date={condition.voidedAt} />: {condition.voidReason}
            </p>
          )}
        </div>
        {actions}
      </div>
      {footer}
    </li>
  );
}
