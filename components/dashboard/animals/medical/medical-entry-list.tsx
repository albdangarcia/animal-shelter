import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import { MedicalEntryItem } from "./medical-entry-item";
import { MedicalEntryActions } from "./medical-entry-actions";
import { MedicalEntryChanges } from "./medical-entry-changes";
import { ScheduledEntryActions } from "./scheduled-entry-actions";
import { ExemptionReviewActions } from "./exemption-review-actions";

interface Props {
  entries: MedicalEntryDisplay[];
  names: Record<string, string>;
  /** The shelter's today, for marking scheduled care overdue or due today. */
  today: CalendarDay;
  /** The shelter's units, for an exam's vitals. */
  unitSystem: WeightUnitSystem;
  /** Null for a viewer who may only read. */
  controls: MedicalControls | null;
  /**
   * The rows are the due list: each also gets the buttons for what can be
   * done with care that is due, as the viewer may.
   */
  due?: boolean;
  /**
   * On the due list, the spay/neuter exemption open for review: it is due on
   * its review day. It isn't recorded, rescheduled or declined: the spay or
   * neuter is scheduled from it, or a new exemption recorded.
   */
  reviewId?: string | null;
  className?: string;
}

/**
 * Entries with their change history, and the row actions menu on each one
 * that isn't voided when the viewer may manage them: Void on every entry,
 * and Edit on given care only. On the due list, each row of scheduled care
 * also gets Record, Reschedule and Decline, and the exemption open for
 * review gets its own two actions.
 */
export function MedicalEntryList({
  entries,
  names,
  today,
  unitSystem,
  controls,
  due = false,
  reviewId = null,
  className,
}: Props) {
  return (
    <ul className={className ?? "space-y-3"}>
      {entries.map((entry) => (
        <MedicalEntryItem
          key={entry.id}
          entry={entry}
          today={today}
          unitSystem={unitSystem}
          review={due && entry.id === reviewId}
          actions={
            controls?.canManage && !entry.voidedAt ? (
              <MedicalEntryActions
                animalId={controls.animalId}
                entry={entry}
                options={controls.options}
              />
            ) : undefined
          }
          footer={
            <>
              {due &&
                controls?.canManage &&
                entry.id === reviewId &&
                entry.procedure &&
                entry.exemptionReason && (
                  <ExemptionReviewActions
                    animalId={controls.animalId}
                    exemption={{
                      procedure: entry.procedure,
                      exemptionReason: entry.exemptionReason,
                    }}
                    options={controls.options}
                  />
                )}
              {due && controls && entry.id !== reviewId && (
                <ScheduledEntryActions
                  animalId={controls.animalId}
                  entry={entry}
                  options={controls.options}
                  today={today}
                  canManage={controls.canManage}
                  canAdminister={controls.canAdminister}
                />
              )}
              <MedicalEntryChanges events={entry.events} names={names} />
            </>
          }
        />
      ))}
    </ul>
  );
}
