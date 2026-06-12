"use client";

import { Table } from "@tanstack/react-table";
import {
  TaskCategoryOptions,
  TaskStatusOptions,
} from "@/app/lib/utils/enum-formatter";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { AllAnimalsTasksPayload } from "@/app/lib/data/all-animal-tasks.data";

interface TasksDataTableToolbarProps {
  table: Table<AllAnimalsTasksPayload>;
}

const TasksDataTableToolbar = ({ table }: TasksDataTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="task-search"
      searchPlaceholder="Filter Tasks..."
      filterParamKeys={["category", "status"]}
      filters={
        <>
          <ServerSideFacetedFilter
            title="Category"
            paramKey="category"
            options={TaskCategoryOptions}
          />
          <ServerSideFacetedFilter
            title="Status"
            paramKey="status"
            options={TaskStatusOptions}
          />
        </>
      }
    />
  );
};

export default TasksDataTableToolbar;