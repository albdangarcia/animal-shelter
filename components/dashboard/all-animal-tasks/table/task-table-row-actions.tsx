"use client";

import { Row } from "@tanstack/react-table";
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
import { TaskAssignee } from "@/app/lib/types";
import { updateAnimalTaskStatus } from "@/app/lib/actions/animal-task.actions";
import { TaskStatus } from "@prisma/client";
import { TaskStatusOptions } from "@/app/lib/utils/enum-formatter";
import { TaskForm } from "../../animals/tasks/task-form";
import { AllAnimalsTasksPayload } from "@/app/lib/data/all-animal-tasks.data";

interface DataTableRowActionsProps {
  row: Row<AllAnimalsTasksPayload>;
  assigneeList: TaskAssignee[];
}

export function DataTableRowActions({
  row,
  assigneeList,
}: DataTableRowActionsProps) {
  const task = row.original;
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const onSoftDelete = () => {
    const originalStatus = task.status;
    updateAnimalTaskStatus(row.original.animal.id, task.id, TaskStatus.DELETED);

    toast.success("Task moved to trash.", {
      action: {
        label: "Undo",
        onClick: () => {
          updateAnimalTaskStatus(row.original.animal.id, task.id, originalStatus);
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
        <DropdownMenuContent align="end" className="w-40">
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
                  updateAnimalTaskStatus(
                    row.original.animal.id,
                    task.id,
                    newStatus as TaskStatus
                  );
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

      <DialogContent className="sm:max-w-150">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update the details for this task. Click update when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <TaskForm
          animalId={row.original.animal.id}
          onFormSubmit={() => setIsDialogOpen(false)}
          assigneeList={assigneeList}
          task={task}
        />
      </DialogContent>
    </Dialog>
  );
}