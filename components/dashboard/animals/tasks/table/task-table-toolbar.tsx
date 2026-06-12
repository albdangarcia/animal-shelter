"use client";

import { useState } from "react";
import { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  TaskCategoryOptions,
  TaskStatusOptions,
} from "@/app/lib/utils/enum-formatter";
import { FetchAnimalTasksPayload } from "@/app/lib/data/animals/animal-task.data";
import { TaskForm } from "../task-form";
import { TaskAssignee } from "@/app/lib/types";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { DataTableToolbar } from "@/components/table-common/data-table-toolbar";

interface TasksDataTableToolbarProps {
  table: Table<FetchAnimalTasksPayload>;
  animalId: string;
  assigneeList: TaskAssignee[];
}

const TasksDataTableToolbar = ({
  table,
  animalId,
  assigneeList,
}: TasksDataTableToolbarProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
      extraActions={
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="h-8">
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-150">
            <DialogHeader>
              <DialogTitle>Create Task</DialogTitle>
              <DialogDescription>
                Create a new task for this animal. Click create task when
                you&apos;re done.
              </DialogDescription>
            </DialogHeader>
            <TaskForm
              animalId={animalId}
              onFormSubmit={() => setIsDialogOpen(false)}
              assigneeList={assigneeList}
            />
          </DialogContent>
        </Dialog>
      }
    />
  );
};

export default TasksDataTableToolbar;