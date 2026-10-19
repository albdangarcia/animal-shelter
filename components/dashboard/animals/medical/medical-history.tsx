import { MedicalRecordHeader } from "./medical-record-header";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { SimplePagination } from "@/components/simple-pagination";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import type { MedicalHistoryItem } from "@/app/lib/data/animals/medical-entry.data";
import { MEDICAL_ENTRY_KIND_LABELS } from "@/app/lib/constants/medical";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import { MedicalEntryRow } from "./medical-entry-list";
import { CareEpisodeRow, ConditionRow } from "./condition-list";
import { AddMedicalEntryMenu } from "./add-medical-entry-menu";
import { MedicationOrderItem } from "./medication-order-item";
import { MedicationOrderActions } from "./medication-order-actions";
import { orderSummary } from "@/app/lib/data/animals/medication-view";

// Every entry kind, then the records History lists beside entries.
const kindOptions = [
  ...Object.values(MedicalEntryKind).map((kind) => ({
    value: kind,
    label: MEDICAL_ENTRY_KIND_LABELS[kind],
  })),
  { value: "CONDITION", label: "Condition" },
  { value: "CARE_EPISODE", label: "Care episode" },
  { value: "MEDICATION", label: "Medication" },
];

interface Props {
  animalId: string;
  animalName: string;
  /** Entries, problem-list rows and care episodes, newest first. */
  items: MedicalHistoryItem[];
  totalPages: number;
  names: Record<string, string>;
  today: CalendarDay;
  /** The shelter\'s units, for an exam\'s vitals. */
  unitSystem: WeightUnitSystem;
  controls: MedicalControls | null;
}

const MedicalHistory = ({
  animalId,
  animalName,
  items,
  totalPages,
  names,
  today,
  unitSystem,
  controls,
}: Props) => {
  return (
    <Card className="@container/card">
      <MedicalRecordHeader
        section="history"
        action={controls?.canManage ? (
          <AddMedicalEntryMenu
            animalId={controls.animalId}
            options={controls.options}
          />
        ) : undefined}
      />
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <ServerSideFacetedFilter
            title="Kind"
            paramKey="kind"
            options={kindOptions}
          />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            <a href={`/medical-outputs/animals/${animalId}/history`}>
              <Printer aria-hidden="true" />
              Print adopter medical history
            </a>
          </Button>
        </div>
        {items.length > 0 ? (
          <ul className="space-y-3">
            {items.map((item) => {
              switch (item.source) {
                case "ENTRY":
                  return (
                    <MedicalEntryRow
                      key={item.id}
                      entry={item.entry}
                      names={names}
                      today={today}
                      unitSystem={unitSystem}
                      controls={controls}
                    />
                  );
                case "CONDITION":
                  return (
                    <ConditionRow
                      key={item.id}
                      condition={item.condition}
                      names={names}
                      controls={controls}
                    />
                  );
                case "EPISODE":
                  return (
                    <CareEpisodeRow
                      key={item.id}
                      episode={item.episode}
                      names={names}
                      controls={controls}
                      animalName={animalName}
                    />
                  );
                case "ORDER": {
                  const summary = orderSummary(item.order, today);
                  const orderOptions = controls?.canManage ? controls.orderOptions : null;
                  return (
                    <MedicationOrderItem
                      key={item.id}
                      summary={summary}
                      names={names}
                      actions={
                        controls && orderOptions ? (
                          <MedicationOrderActions
                            animalId={controls.animalId}
                            summary={summary}
                            options={orderOptions}
                          />
                        ) : undefined
                      }
                    />
                  );
                }
              }
            })}
          </ul>
        ) : (
          <div className="text-center py-12 px-6 border-2 border-dashed rounded-lg">
            <p className="font-semibold text-lg">No Entries Found</p>
            <p className="text-sm mt-1 text-muted-foreground">
              Nothing recorded yet, or nothing of the kinds picked.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <SimplePagination totalPages={totalPages} />
      </CardFooter>
    </Card>
  );
};

export default MedicalHistory;
