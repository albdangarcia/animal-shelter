"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableRowActions } from "./task-table-row-actions";
import { TaskAssignee } from "@/app/lib/types";
import { formatDateOrNA, formatDueDate } from "@/app/lib/utils/date-utils";
import { DataTableColumnHeader } from "@/components/table-common/data-table-column-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateAnimalTaskAssignee } from "@/app/lib/actions/animal-task.actions";
import {
  categories,
  priorities,
  statuses,
} from "../../animals/tasks/table/task-options";
import Link from "next/link";
import { AllAnimalsTasksPayload } from "@/app/lib/data/all-animal-tasks.data";

export interface GetColumnsProps {
  assigneeList: TaskAssignee[];
}

export const getColumns = ({
  assigneeList,
}: GetColumnsProps): ColumnDef<AllAnimalsTasksPayload>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-0.5"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-0.5"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "animal.id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Animal" />
    ),
    cell: ({ row }) => {
      const priority = priorities.find(
        (priority) => priority.value === row.original.priority
      );

      const animal = row.original.animal;

      return (
        <div className="flex space-x-2">
          {priority && <Badge variant="outline">{priority.label}</Badge>}
          <Link
            href={`/dashboard/animals/${animal.id}/tasks`}
            className="font-medium hover:underline"
          >
            {animal.name}
          </Link>
        </div>
      );
    },
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    cell: ({ row }) => {
      return (
        <span className="max-w-125 truncate font-medium">
          {row.getValue("title")}
        </span>
      );
    },
  },
  {
    accessorKey: "details",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Details" />
    ),
    cell: ({ row }) => (
      <span className="max-w-100 truncate">{row.getValue("details")}</span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = statuses.find(
        (status) => status.value === row.getValue("status")
      );

      if (!status) {
        return null;
      }

      return (
        <Badge variant="outline" className="flex w-fit items-center">
          {status.icon && (
            <status.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{status.label}</span>
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "category",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Category" />
    ),
    cell: ({ row }) => {
      const category = categories.find(
        (category) => category.value === row.getValue("category")
      );

      return category ? (
        <Badge variant="outline" className="flex w-fit items-center">
          {category.icon && (
            <category.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{category.label}</span>
        </Badge>
      ) : null;
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "priority",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Priority" />
    ),
    cell: ({ row }) => {
      const priority = priorities.find(
        (priority) => priority.value === row.getValue("priority")
      );

      if (!priority) {
        return null;
      }

      return (
        <Badge variant="outline" className="flex w-fit items-center">
          {priority.icon && (
            <priority.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{priority.label}</span>
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "assignee",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Assignee" />
    ),
    cell: ({ row }) => {
      const task = row.original;
      const currentAssigneeId = task.assignee?.id || "unassigned";

      const handleAssigneeChange = async (newAssigneeId: string) => {
        const result = await updateAnimalTaskAssignee(
          task.id,
          newAssigneeId === "unassigned" ? null : newAssigneeId
        );

        if (!result.success) {
          toast.error(result.message);
        } else {
          toast.success("Assignee updated successfully.");
        }
      };

      return (
        <Select value={currentAssigneeId} onValueChange={handleAssigneeChange}>
          <SelectTrigger className="w-full max-w-45">
            <SelectValue placeholder="Assign..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {assigneeList.map((assignee) => (
              <SelectItem key={assignee.id} value={assignee.id}>
                {assignee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    },
  },
  {
    accessorKey: "dueDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Due Date" />
    ),
    meta: {
      displayName: "Due Date",
    },
    cell: ({ row }) => {
      // Get the entire task object from the row
      const task = row.original;
      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

      // Define active statuses
      const activeStatuses = ["TODO", "IN_PROGRESS"];

      return (
        <span
          className={
            isOverdue && activeStatuses.includes(task.status)
              ? "text-red-600 font-medium" // Apply a red color for overdue tasks
              : ""
          }
        >
          {formatDueDate(task.dueDate, task.status)}
        </span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
    meta: {
      displayName: "Created At",
    },
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as string | Date | null;
      return <span>{formatDateOrNA(date)}</span>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DataTableRowActions row={row} assigneeList={assigneeList} />
    ),
  },
];
