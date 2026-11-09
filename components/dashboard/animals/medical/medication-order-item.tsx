import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import { TimeAgo } from "@/components/common/time-ago";
import { MedicationOrderEventAction } from "@/prisma/generated/enums";
import type {
  AnimalMedicationOrder,
  DoseCounts,
  OrderSummary,
} from "@/app/lib/data/animals/medication.data";
import type { OrderState } from "@/app/lib/utils/medication-slots";
import { describeMedicationOrderChanges } from "@/app/lib/utils/medication-order-changes";
import { ChangeHistory } from "./change-history";

// What each later event reads as, before its actor.
const EVENT_VERB = {
  EDITED: "Edited",
  DISCONTINUED: "Discontinued",
  VOIDED: "Voided",
} as const;

/** Who ordered it, and every change since behind a toggle. */
export function MedicationOrderChanges({
  events,
  names,
}: {
  events: AnimalMedicationOrder["events"];
  names: Record<string, string>;
}) {
  const created = events.find((event) => event.action === MedicationOrderEventAction.CREATED);
  const nameOf = (id: string) => names[id] ?? "someone";
  return (
    <ChangeHistory
      created={
        created && {
          verb: "Ordered",
          actorName: nameOf(created.actorId),
          createdAt: created.createdAt,
        }
      }
      later={events
        .filter((event) => event.action !== MedicationOrderEventAction.CREATED)
        .map((event) => ({
          id: event.id,
          verb: EVENT_VERB[event.action as keyof typeof EVENT_VERB],
          actorName: nameOf(event.actorId),
          createdAt: event.createdAt,
          reason:
            event.action === MedicationOrderEventAction.VOIDED
              ? ((event.after as { voidReason?: string } | null)?.voidReason ?? "")
              : null,
          changes:
            event.action === MedicationOrderEventAction.VOIDED
              ? []
              : describeMedicationOrderChanges(event.before, event.after),
        }))}
    />
  );
}

const BADGE: Record<OrderState, "default" | "outline" | "secondary" | "destructive"> = {
  ACTIVE: "default",
  UPCOMING: "outline",
  ENDED: "secondary",
  DISCONTINUED: "secondary",
  VOIDED: "destructive",
};

/** "12 given, 1 refused, 2 missed", or "No doses yet". */
export const countsText = ({ given, refused, notGiven, missed }: DoseCounts) => {
  const parts = [
    given > 0 && `${given} given`,
    refused > 0 && `${refused} refused`,
    notGiven > 0 && `${notGiven} not given`,
    missed > 0 && `${missed} missed`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No doses yet";
};

interface Props {
  summary: OrderSummary;
  names: Record<string, string>;
  /** Shown top right: the row's menu, when the viewer may use it. */
  actions?: ReactNode;
  /** Shown under the order: its slots today, its doses. */
  children?: ReactNode;
}

/**
 * One medication order: its line (medication, dose, how often, its days),
 * where it stands, its instructions and prescriber, how it ended, and its
 * change history. A voided order is struck through, with who voided it and
 * why.
 */
export function MedicationOrderItem({ summary, names, actions, children }: Props) {
  const { order, state, line, stateText } = summary;
  const voided = state === "VOIDED";
  return (
    <li
      className="border rounded-lg p-4"
      aria-label={`${order.itemName} order, ${stateText.toLowerCase()}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={clsx("min-w-0 flex-1", voided && "text-muted-foreground")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={clsx("text-sm font-semibold", voided && "line-through")}>
              {line}
            </span>
            <Badge variant={BADGE[state]}>{stateText}</Badge>
          </div>
          <div className={clsx("mt-1 space-y-1 text-sm", voided && "line-through")}>
            {order.instructions && (
              <p className="whitespace-pre-wrap">
                <span className="text-xs text-muted-foreground">Instructions: </span>
                {order.instructions}
              </p>
            )}
            {order.prescribedBy && (
              <p className="text-muted-foreground">Prescribed by {order.prescribedBy}</p>
            )}
          </div>
          {state === "DISCONTINUED" && order.discontinueReason && (
            <p className="mt-1 text-sm">
              <span className="text-xs text-muted-foreground">Why it stopped: </span>
              {order.discontinueReason}
              {order.discontinuedById && (
                <span className="text-muted-foreground">
                  {" "}
                  ({names[order.discontinuedById] ?? "someone"})
                </span>
              )}
            </p>
          )}
          {voided && (
            <p className="mt-2 text-sm">
              Voided by {order.voidedById ? (names[order.voidedById] ?? "someone") : "someone"}{" "}
              <TimeAgo date={order.voidedAt} />: {order.voidReason}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
      <MedicationOrderChanges events={order.events} names={names} />
    </li>
  );
}
