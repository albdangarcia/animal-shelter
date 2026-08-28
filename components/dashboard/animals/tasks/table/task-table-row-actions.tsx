"use client";

import type { Row, StockFeatures } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FetchAnimalTasksPayload } from "@/app/lib/data/animals/animal-task.data";
import { TaskAssignee } from "@/app/lib/types";
import { TaskForm } from "../task-form";
import { updateAnimalTaskStatus } from "@/app/lib/actions/animal-task.actions";
import { TaskStatus } from "@/prisma/generated/enums";
import { TaskStatusOptions } from "@/app/lib/utils/enum-formatter";

interface DataTableRowActionsProps {
  row: Row<StockFeatures, FetchAnimalTasksPayload>;
  assigneeList: TaskAssignee[];
  animalId: string;
  canManage: boolean;
}

export function DataTableRowActions({
  row,
  assigneeList,
  animalId,
  canManage,
}: DataTableRowActionsProps) {
  const task = row.original;
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (!canManage) {
    return null;
  }

  const onSoftDelete = () => {
    const originalStatus = task.status;
    updateAnimalTaskStatus(task.id, TaskStatus.DELETED);

    toast.success("Task moved to trash.", {
      action: {
        label: "Undo",
        onClick: () => {
          updateAnimalTaskStatus(task.id, originalStatus);
          toast.info("Task restored.");
        },
      },
    });
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DialogTrigger asChild>
            <DropdownMenuItem>
              Edit
            </DropdownMenuItem>
          </DialogTrigger>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={task.status}
                onValueChange={(newStatus) => {
                  updateAnimalTaskStatus(task.id, newStatus as TaskStatus);
                  toast.success(`Task status updated`);
                }}
              >
                {TaskStatusOptions.map((status) => (
                  <DropdownMenuRadioItem
                    key={status.value}
                    value={status.value}
                    disabled={task.status === status.value}
                  >
                    {status.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onClick={onSoftDelete}
            disabled={task.status === TaskStatus.DELETED}
          >
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update the details for this task. Click update when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <TaskForm
          animalId={animalId}
          onFormSubmit={() => setIsDialogOpen(false)}
          assigneeList={assigneeList}
          task={task}
        />
      </DialogContent>
    </Dialog>
  );
}