"use client";

import { useRef, useState } from "react";
import type { StockFeatures, Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";

interface TasksDataTableToolbarProps {
  table: Table<StockFeatures, FetchAnimalTasksPayload>;
  animalId: string;
  assigneeList: TaskAssignee[];
  canManage: boolean;
}

const TasksDataTableToolbar = ({
  table,
  animalId,
  assigneeList,
  canManage,
}: TasksDataTableToolbarProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const formRef = useRef<DirtyFormHandle>(null);

  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      setIsDialogOpen,
    );

  return (
    <DataTableToolbar
      table={table}
      searchId="task-search"
      searchPlaceholder="Filter by task title..."
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
        <Dialog open={isDialogOpen} onOpenChange={guardedOnOpenChange}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant={canManage ? "default" : "outline"}
              className="disabled:pointer-events-auto disabled:cursor-not-allowed"
              disabled={!canManage}
            >
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
              ref={formRef}
              assigneeList={assigneeList}
            />
          </DialogContent>

          <AlertDialog
            open={isConfirmOpen}
            onOpenChange={(open) => !open && cancelDiscard()}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard unsaved task?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your changes will be lost if you leave without saving.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelDiscard}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmDiscard}>
                  Discard
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Dialog>
      }
    />
  );
};

export default TasksDataTableToolbar;
