"use client";

import { useId } from "react";
import { clsx } from "clsx";
import { Checkbox } from "@/components/ui/checkbox";
import {
  matchProtocol,
  planProtocol,
  type ProtocolPlanFacts,
  type ProtocolPlanProtocol,
} from "@/app/lib/utils/medical-protocol-plan";
import {
  notScheduledText,
  plannedEntriesText,
  protocolPreviewLines,
  protocolTitle,
} from "@/app/lib/utils/medical-protocol-text";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

interface ProtocolPreviewProps {
  /** The live protocols, with their live steps. */
  protocols: ProtocolPlanProtocol[];
  /**
   * What the plan reads about the animal, from the form and its record; null
   * while the form doesn't yet say its species, birth day and intake day.
   */
  facts: ProtocolPlanFacts | null;
  /** Today on the shelter's calendar, from the server. */
  today: CalendarDay;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * The medical protocol an intake will apply, and the care it will schedule,
 * as the form stands: the same plan the server makes when the intake is
 * saved, so staff see it before they save. One box leaves it out. Nothing
 * shows while no protocol fits the animal.
 */
export function ProtocolPreview({
  protocols,
  facts,
  today,
  checked,
  onCheckedChange,
}: ProtocolPreviewProps) {
  const headingId = useId();
  const protocol = facts ? matchProtocol(protocols, facts) : null;
  if (!facts || !protocol) return null;

  const plan = planProtocol(protocol, facts, today);
  const lines = protocolPreviewLines(plan, protocol.steps, today);
  const notScheduled = notScheduledText(plan.skipped);

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h3 id={headingId} className="font-semibold border-b pb-2">
        Medical Protocol
      </h3>
      <div className={clsx("space-y-2 text-sm", !checked && "text-muted-foreground")}>
        <p className="font-medium">
          {protocolTitle(protocol.name)}: {plannedEntriesText(plan.entries.length)}
        </p>
        {lines.length > 0 && (
          <ul className="space-y-1">
            {lines.map((line) => (
              <li key={line.stepId}>
                <span className="font-medium">{line.name}:</span> {line.days}
              </li>
            ))}
          </ul>
        )}
        {notScheduled && <p className="text-muted-foreground">{notScheduled}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        Schedule this protocol&apos;s care
      </label>
      {!checked && (
        <p className="text-sm text-muted-foreground">
          Nothing from this protocol will be scheduled. Care can still be
          scheduled on the animal&apos;s Medical tab.
        </p>
      )}
    </section>
  );
}
