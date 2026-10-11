import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import { MedicalEntryItem } from "./medical-entry-item";
import { MedicalEntryActions } from "./medical-entry-actions";
import { MedicalEntryChanges } from "./medical-entry-changes";

/** What a viewer holding MEDICAL_MANAGE gets: the forms' options. */
export type MedicalManage = {
  animalId: string;
  options: MedicalEntryFormOptions;
} | null;

interface Props {
  entries: MedicalEntryDisplay[];
  names: Record<string, string>;
  manage: MedicalManage;
  className?: string;
}

/**
 * Entries with their change history, and Edit and Void on each one that
 * isn't voided when the viewer may manage them.
 */
export function MedicalEntryList({ entries, names, manage, className }: Props) {
  return (
    <ul className={className ?? "space-y-3"}>
      {entries.map((entry) => (
        <MedicalEntryItem
          key={entry.id}
          entry={entry}
          actions={
            manage && !entry.voidedAt ? (
              <MedicalEntryActions
                animalId={manage.animalId}
                entry={entry}
                options={manage.options}
              />
            ) : undefined
          }
          footer={<MedicalEntryChanges events={entry.events} names={names} />}
        />
      ))}
    </ul>
  );
}
