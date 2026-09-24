"use client";

import Link from "next/link";
import type { ColumnDef, StockFeatures } from "@tanstack/react-table";
import type { OutcomeType } from "@/prisma/generated/enums";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { OutcomeTypesOptions } from "./outcome-options";
import { DataTableColumnHeader } from "../../../table-common/data-table-column-header";
import { DataTableRowActions } from "./outcome-table-row-actions";
import { OutcomeWithDetails } from "@/app/lib/data/animals/outcome.data";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReversedOutcomeBadge } from "../reversed-outcome-badge";

// Maps outcome types to their recipient's relationship label. Types not
// listed here (deceased, euthanized, other) genuinely have no recipient.
const recipientRelationshipLabel: Partial<Record<OutcomeType, string>> = {
  ADOPTION: "Adopter",
  TRANSFER_OUT: "Partner",
  RETURN_TO_OWNER: "Owner",
};

export interface GetColumnsProps {
  canManage: boolean;
  canReverse: boolean;
}

export const getColumns = ({
  canManage,
  canReverse,
}: GetColumnsProps): ColumnDef<StockFeatures, OutcomeWithDetails>[] => [
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
    accessorFn: (row) => row.animal.name,
    id: "animal",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Animal" />
    ),
    cell: ({ row }) => {
      const { animal } = row.original;
      return (
        <div className="font-medium">
          <Link
            href={`/dashboard/animals/${animal.id}`}
            className="hover:underline"
          >
            {animal.name}
          </Link>
        </div>
      );
    },
  },
  {
    accessorFn: (row) =>
      row.adoptionApplication?.applicantName ||
      row.destinationPartner?.name ||
      row.owner?.name ||
      "",
    id: "recipient",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Recipient" />
    ),
    enableSorting: false,
    cell: ({ row }) => {
      const name = row.getValue("recipient") as string;
      const relationshipLabel = recipientRelationshipLabel[row.original.type];

      if (!name || !relationshipLabel) {
        return <span className="text-muted-foreground">N/A</span>;
      }

      return (
        <div className="flex max-w-125 items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          <Badge variant="outline" className="shrink-0">
            {relationshipLabel}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const outcomeType = OutcomeTypesOptions.find(
        (type) => type.value === row.getValue("type"),
      );

      if (!outcomeType) {
        return null;
      }

      // Define a mapping from outcome type to badge variant
      const variantMap: {
        [key: string]: "default" | "secondary" | "destructive" | "outline";
      } = {
        ADOPTION: "default",
        TRANSFER_OUT: "secondary",
        RETURN_TO_OWNER: "outline",
        DECEASED: "destructive",
        EUTHANIZED: "destructive",
      };

      const variant = variantMap[outcomeType.value] || "secondary";

      const { reversedAt, reversedBy, reversalReason } = row.original;

      return (
        <div className="flex items-center gap-2">
          <Badge variant={variant} className="whitespace-nowrap">
            {outcomeType.icon && <outcomeType.icon className="mr-2 h-4 w-4" />}
            {outcomeType.label}
          </Badge>
          {reversedAt && (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Focusable, so the reason is reachable from the keyboard
                    as well as on hover. */}
                <span tabIndex={0} className="cursor-help">
                  <ReversedOutcomeBadge />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Reversed by {reversedBy?.name ?? "Unknown User"} on{" "}
                {formatDateOrNA(reversedAt)}: {reversalReason}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorFn: (row) => row.outcomeDate,
    id: "outcomeDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Outcome Date" />
    ),
    meta: {
      displayName: "Outcome Date",
    },
    cell: ({ row }) => {
      // The column holds a calendar day; a table cell reads it untyped.
      const day = row.getValue("outcomeDate") as string | undefined | null;
      return <span>{formatShelterDayOrNA(day)}</span>;
    },
  },
  {
    accessorKey: "staffMember.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Processed By" />
    ),
    meta: {
      displayName: "Staff Name",
    },
    cell: ({ row }) => {
      const staffName = row.original.staffMember.name;
      return <span>{staffName}</span>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DataTableRowActions
        row={row}
        canManage={canManage}
        canReverse={canReverse}
      />
    ),
  },
];