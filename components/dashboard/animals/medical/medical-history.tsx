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
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry.data";
import { MEDICAL_ITEM_KIND_LABELS } from "@/app/lib/constants/medical";
import { MedicalEntryList, type MedicalManage } from "./medical-entry-list";
import { AddMedicalEntryMenu } from "./add-medical-entry-menu";

const kindOptions = Object.values(MedicalEntryKind).map((kind) => ({
  value: kind,
  label: MEDICAL_ITEM_KIND_LABELS[kind],
}));

interface Props {
  entries: MedicalEntryDisplay[];
  totalPages: number;
  names: Record<string, string>;
  manage: MedicalManage;
}

const MedicalHistory = ({ entries, totalPages, names, manage }: Props) => {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">History</CardTitle>
        <CardDescription>
          Every entry, newest first. Voided entries stay here, struck
          through, with who voided them and why.
        </CardDescription>
        {manage && (
          <CardAction>
            <AddMedicalEntryMenu animalId={manage.animalId} options={manage.options} />
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
        {entries.length > 0 ? (
          <MedicalEntryList entries={entries} names={names} manage={manage} />
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
