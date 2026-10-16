import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SimplePagination } from "@/components/simple-pagination";
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
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">History</CardTitle>
        <CardDescription>
          Every entry, condition, care episode and medication order, newest
          first by the day given or due, the onset or the start, so care
          still to come is at the top. Voided ones stay here, struck through,
          with who voided them and why. Doses are on Medications.
        </CardDescription>
        {controls?.canManage && (
          <CardAction>
            <AddMedicalEntryMenu
              animalId={controls.animalId}
              options={controls.options}
            />
          </CardAction>
        )}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <ServerSideFacetedFilter
            title="Kind"
            paramKey="kind"
            options={kindOptions}
          />
        </div>
      </CardHeader>
      <CardContent>
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
