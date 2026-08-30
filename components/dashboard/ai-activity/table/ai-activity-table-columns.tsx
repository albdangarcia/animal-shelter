"use client";

import type { ColumnDef, StockFeatures } from "@tanstack/react-table";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/table-common/data-table-column-header";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { toolLabel } from "@/app/lib/data/ai-activity";
import type { AiActivityLogRow } from "@/app/lib/data/ai-activity.data";
import type { TaskStatus } from "@/prisma/generated/enums";
import { statuses } from "../../animals/tasks/table/task-options";
import { AiActivityRowActions } from "./ai-activity-table-row-actions";

export interface AiActivityTableExtra {
  canManage: boolean;
  actorOptions: { label: string; value: string }[];
}

const StatusBadge = ({ status }: { status: TaskStatus }) => {
  const meta = statuses.find((s) => s.value === status);
  if (!meta) {
    return <Badge variant="outline">{status}</Badge>;
  }
  return (
    <Badge variant="outline" className="flex w-fit items-center">
      {meta.icon && (
        <meta.icon className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span>{meta.label}</span>
    </Badge>
  );
};

export const getColumns = ({
  canManage,
}: AiActivityTableExtra): ColumnDef<StockFeatures, AiActivityLogRow>[] => [
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="When" />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {formatDateOrNA(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "actor",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Who" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{row.original.actorName}</span>
    ),
  },
  {
    accessorKey: "toolName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="What" />
    ),
    cell: ({ row }) => <span>{toolLabel(row.original.toolName)}</span>,
  },
  {
    id: "target",
    header: "Target",
    cell: ({ row }) => {
      const target = row.original.target;
      if (!target) {
        // Target no longer exists — render the id rather than crashing.
        return (
          <span className="text-muted-foreground italic">
            {row.original.targetId}
          </span>
        );
      }
      return (
        <Link
          href={`/dashboard/animals/${target.animalId}/tasks`}
          className="font-medium hover:underline"
        >
          {target.title}
          <span className="text-muted-foreground"> · {target.animalName}</span>
        </Link>
      );
    },
  },
  {
    id: "change",
    header: "Change",
    cell: ({ row }) => {
      const change = row.original.taskChange;
      if (!change) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <div className="flex w-fit items-center gap-2">
          <StatusBadge status={change.before} />
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <StatusBadge status={change.after} />
        </div>
      );
    },
  },
  {
    accessorKey: "undoneAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="State" />
    ),
    cell: ({ row }) =>
      row.original.undoneAt ? (
        <Badge variant="secondary">Undone</Badge>
      ) : null,
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <AiActivityRowActions row={row} canManage={canManage} />
    ),
  },
];
