import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import { MedicalEntryItem } from "./medical-entry-item";
import { MedicalEntryActions } from "./medical-entry-actions";
import { MedicalEntryChanges } from "./medical-entry-changes";

interface Props {
  entries: MedicalEntryDisplay[];
  names: Record<string, string>;
  /** Null for a viewer who may only read. */
  controls: MedicalControls | null;
  className?: string;
}

/**
 * Entries with their change history, and Edit and Void on each one that
 * isn't voided when the viewer may manage them.
 */
export function MedicalEntryList({ entries, names, controls, className }: Props) {
  return (
    <ul className={className ?? "space-y-3"}>
      {entries.map((entry) => (
        <MedicalEntryItem
          key={entry.id}
          entry={entry}
          actions={
            controls?.canManage && !entry.voidedAt ? (
              <MedicalEntryActions
                animalId={controls.animalId}
                entry={entry}
                options={controls.options}
              />
            ) : undefined
          }
          footer={<MedicalEntryChanges events={entry.events} names={names} />}
        />
      ))}
    </ul>
  );
}
