import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
];

export function VitalsToolbar() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ServerSideFacetedFilter title="Status" paramKey="status" options={statusOptions} />
      <ServerSideSort
        paramKey="sort"
        placeholder="Select order"
        options={[
          { label: "Newest First", value: "recordedAt.desc" },
          { label: "Oldest First", value: "recordedAt.asc" },
        ]}
      />
    </div>
  );
}
