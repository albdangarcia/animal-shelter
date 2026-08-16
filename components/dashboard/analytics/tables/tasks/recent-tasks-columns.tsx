"use client";

import type { ColumnDef, StockFeatures } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatDateOrNA, formatDueDate } from "@/app/lib/utils/date-utils";
import { DataTableColumnHeader } from "@/components/table-common/data-table-column-header";
import {
  categories,
  priorities,
  statuses,
} from "../../../animals/tasks/table/task-options";
import Link from "next/link";
import { TaskAnalyticsPayload } from "@/app/lib/data/analytics.data";

export const recentTasksColumns: ColumnDef<StockFeatures, TaskAnalyticsPayload>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    cell: ({ row }) => {
      const priority = priorities.find(
        (p) => p.value === row.original.priority,
      );
      return (
        <div className="flex space-x-2">
          {priority && <Badge variant="outline">{priority.label}</Badge>}
          <span className="max-w-125 truncate font-medium">
            {row.getValue("title")}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "animal.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Animal Name" />
    ),
    cell: ({ row }) => {
      const animal = row.original.animal;
      return (
        <Link
          className="font-medium hover:underline"
          href={`/dashboard/animals/${animal.id}`}
        >
          {animal.name}
        </Link>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = statuses.find((s) => s.value === row.getValue("status"));
      if (!status) return null;
      return (
        <Badge variant="outline" className="flex w-fit items-center">
          {status.icon && (
            <status.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{status.label}</span>
        </Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "category",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Category" />
    ),
    cell: ({ row }) => {
      const category = categories.find(
        (c) => c.value === row.getValue("category"),
      );
      return category ? (
        <Badge variant="outline" className="flex items-center">
          {category.icon && (
            <category.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{category.label}</span>
        </Badge>
      ) : null;
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "priority",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Priority" />
    ),
    cell: ({ row }) => {
      const priority = priorities.find(
        (p) => p.value === row.getValue("priority"),
      );
      if (!priority) return null;
      return (
        <Badge variant="outline" className="flex items-center">
          {priority.icon && (
            <priority.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span>{priority.label}</span>
        </Badge>
      );
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    // Read-only text — no editable Select, no assignee mutation
    accessorKey: "assignee",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Assignee" />
    ),
    cell: ({ row }) => {
      const assignee = row.original.assignee;
      return (
        <span className="text-sm">
          {assignee?.name ?? (
            <span className="text-muted-foreground italic">Unassigned</span>
          )}
        </span>
      );
    },
  },
  {
    accessorKey: "dueDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Due Date" />
    ),
    meta: { displayName: "Due Date" },
    cell: ({ row }) => {
      const task = row.original;
      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
      const isOverdueAndActive =
        isOverdue && ["TODO", "IN_PROGRESS"].includes(task.status);
      return isOverdueAndActive ? (
        <Badge variant="destructive">
          {formatDueDate(task.dueDate, task.status)}
        </Badge>
      ) : (
        <span>{formatDueDate(task.dueDate, task.status)}</span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
    meta: { displayName: "Created At" },
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as string | Date | null;
      return <span>{formatDateOrNA(date)}</span>;
    },
  },
];