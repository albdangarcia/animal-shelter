import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { MedicalDocumentType } from "@/prisma/generated/enums";
import { MEDICAL_DOCUMENT_TYPE_LABELS } from "@/app/lib/constants/medical";

const typeOptions = Object.values(MedicalDocumentType).map((value) => ({
  value,
  label: MEDICAL_DOCUMENT_TYPE_LABELS[value],
}));

export function DocumentTypeFilter() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ServerSideFacetedFilter title="Type" paramKey="type" options={typeOptions} />
    </div>
  );
}
