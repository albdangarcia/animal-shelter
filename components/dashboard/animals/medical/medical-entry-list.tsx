import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { MedicalEntryItem } from "./medical-entry-item";
import { MedicalEntryActions } from "./medical-entry-actions";
import { MedicalEntryChanges } from "./medical-entry-changes";
import { ScheduledEntryActions } from "./scheduled-entry-actions";

interface Props {
  entries: MedicalEntryDisplay[];
  names: Record<string, string>;
  /** The shelter's today, for marking scheduled care overdue or due today. */
  today: CalendarDay;
  /** Null for a viewer who may only read. */
  controls: MedicalControls | null;
  /**
   * The rows are the due list: each also gets the buttons for what can be
   * done with care that is due, as the viewer may.
   */
  due?: boolean;
  className?: string;
}

/**
 * Entries with their change history, and the row actions menu on each one
 * that isn't voided when the viewer may manage them: Void on every entry,
 * and Edit on given care only. On the due list, each row also gets
 * Record, Reschedule and Decline.
 */
export function MedicalEntryList({
  entries,
  names,
  today,
  controls,
  due = false,
  className,
}: Props) {
  return (
    <ul className={className ?? "space-y-3"}>
      {entries.map((entry) => (
        <MedicalEntryItem
          key={entry.id}
          entry={entry}
          today={today}
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
              {due && controls && (
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
