import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import { TimeAgo } from "@/components/common/time-ago";
import { CareEpisodeEventAction } from "@/prisma/generated/enums";
import { CARE_EPISODE_TYPE_LABELS } from "@/app/lib/constants/medical";
import type { CareEpisodeDisplay } from "@/app/lib/data/animals/medical-condition";
import { describeCareEpisodeChanges } from "@/app/lib/utils/care-episode-changes";
import { careEpisodeLabel, isOpenEpisode } from "@/app/lib/utils/problem-list";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { ChangeHistory } from "./change-history";

// What each later event reads as, before its actor.
const EVENT_VERB = {
  CLOSED: "Closed",
  EDITED: "Edited",
  VOIDED: "Voided",
} as const;

/** Who opened a care episode, and every change since behind a toggle. */
export function CareEpisodeChanges({
  events,
  names,
}: {
  events: CareEpisodeDisplay["events"];
  names: Record<string, string>;
}) {
  const opened = events.find((event) => event.action === CareEpisodeEventAction.OPENED);
  // An episode recorded already over was opened with its end day.
  const recordedOver = !!(opened?.after as { endDate?: string | null } | null)?.endDate;
  return (
    <ChangeHistory
      created={
        opened && {
          verb: recordedOver ? "Recorded" : "Opened",
          actorName: opened.actor.name,
          createdAt: opened.createdAt,
        }
      }
      later={events
        .filter((event) => event.action !== CareEpisodeEventAction.OPENED)
        .map((event) => ({
          id: event.id,
          verb: EVENT_VERB[event.action as keyof typeof EVENT_VERB],
          actorName: event.actor.name,
          createdAt: event.createdAt,
          reason:
            event.action === CareEpisodeEventAction.VOIDED
              ? ((event.after as { voidReason?: string } | null)?.voidReason ?? "")
              : null,
          changes:
            event.action === CareEpisodeEventAction.VOIDED
              ? []
              : describeCareEpisodeChanges(event.before, event.after, names),
        }))}
    />
  );
}

interface Props {
  episode: CareEpisodeDisplay;
  /** Shown top right: the row's menu, when the viewer may use it. */
  actions?: ReactNode;
  /** Shown under the episode: its change history, and Close. */
  footer?: ReactNode;
}

/**
 * One care episode: what kind of care and where, its days, why, and its
 * notes. A voided episode is struck through, with who voided it and why.
 */
export function CareEpisodeItem({ episode, actions, footer }: Props) {
  const voided = !!episode.voidedAt;
  const open = isOpenEpisode(episode);
  const days = episode.endDate
    ? `${formatShelterDayOrNA(episode.startDate)} to ${formatShelterDayOrNA(episode.endDate)}`
    : `Since ${formatShelterDayOrNA(episode.startDate)}`;

  return (
    <li
      className="border rounded-lg p-4"
      aria-label={`${careEpisodeLabel(episode)}${voided ? ", voided" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={clsx("min-w-0 flex-1", voided && "text-muted-foreground")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={clsx("text-sm font-semibold", voided && "line-through")}>
              {CARE_EPISODE_TYPE_LABELS[episode.type]}
              {episode.partner && ` · ${episode.partner.name}`}
            </span>
            {open && <Badge variant="destructive">Open</Badge>}
            {voided && <Badge variant="destructive">Voided</Badge>}
            <span
              className={clsx("text-sm text-muted-foreground", voided && "line-through")}
            >
              {days}
            </span>
          </div>

          <div className={clsx(voided && "line-through")}>
            <p className="mt-1 text-sm whitespace-pre-wrap">
              <span className="text-xs text-muted-foreground">Reason: </span>
              {episode.reason}
            </p>
            {episode.notes && (
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {episode.notes}
              </p>
            )}
          </div>

          {voided && (
            <p className="mt-2 text-sm">
              Voided by {episode.voidedBy?.name ?? "someone"}{" "}
              <TimeAgo date={episode.voidedAt} />: {episode.voidReason}
            </p>
          )}
        </div>
        {actions}
      </div>
      {footer}
    </li>
  );
}
