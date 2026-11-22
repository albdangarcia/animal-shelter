"use client";

import type { StockFeatures, Table } from "@tanstack/react-table";
import {
  TaskCategoryOptions,
  TaskStatusOptions,
} from "@/app/lib/utils/enum-formatter";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSwitch } from "@/components/table-common/server-side-switch";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";
import { TASK_DUE_OPTIONS } from "@/app/lib/constants/task-due";
import type { AllAnimalsTasksPayload } from "@/app/lib/data/all-animal-tasks";

interface TasksDataTableToolbarProps {
  table: Table<StockFeatures, AllAnimalsTasksPayload>;
}

const TasksDataTableToolbar = ({ table }: TasksDataTableToolbarProps) => {
  return (
    <DataTableToolbar
      table={table}
      searchId="task-search"
      searchPlaceholder="Filter by task title..."
      filterParamKeys={["category", "status", "due", "hideLeft"]}
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
          <ServerSideFacetedFilter
            title="Due"
            paramKey="due"
            options={[...TASK_DUE_OPTIONS]}
          />
          <ServerSideSwitch
            paramKey="hideLeft"
            label="Hide animals that have left"
          />
        </>
      }
    />
  );
};

export default TasksDataTableToolbar;