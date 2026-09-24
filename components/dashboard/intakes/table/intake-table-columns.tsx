"use client";

import Link from "next/link";
import type { ColumnDef, StockFeatures } from "@tanstack/react-table";
import { IntakeType } from "@/prisma/generated/enums";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { IntakeTypesOptions } from "./intake-options";
import { DataTableColumnHeader } from "../../../table-common/data-table-column-header";
import { DataTableRowActions } from "./intake-table-row-actions";
import type { IntakeWithDetails } from "@/app/lib/data/animals/intake.data";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";

// Where the animal came from, which depends on how it arrived: the partner
// that sent it, the person who surrendered it, or where a stray was found.
// The other types record no source.
const describeSource = (
  intake: IntakeWithDetails,
): { name: string; label: string } | null => {
  switch (intake.type) {
    case IntakeType.TRANSFER_IN:
      return intake.sourcePartner
        ? { name: intake.sourcePartner.name, label: "Partner" }
        : null;
    case IntakeType.OWNER_SURRENDER:
      return intake.surrenderingPerson
        ? { name: intake.surrenderingPerson.name, label: "Surrendered by" }
        : null;
    case IntakeType.STRAY: {
      const place = [intake.foundCity, intake.foundState]
        .filter(Boolean)
        .join(", ");
      return place ? { name: place, label: "Found" } : null;
    }
    default:
      return null;
  }
};

export interface GetColumnsProps {
  canManage: boolean;
}

export const getColumns = ({
  canManage,
}: GetColumnsProps): ColumnDef<StockFeatures, IntakeWithDetails>[] => [
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
    accessorFn: (row) => row.intakeDate,
    id: "intakeDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Intake Date" />
    ),
    meta: {
      displayName: "Intake Date",
    },
    cell: ({ row }) => (
      <span>{formatShelterDayOrNA(row.original.intakeDate)}</span>
    ),
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
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const intakeType = IntakeTypesOptions.find(
        (type) => type.value === row.original.type,
      );
      if (!intakeType) {
        return null;
      }
      return (
        <Badge variant="outline" className="whitespace-nowrap">
          <intakeType.icon className="mr-2 h-4 w-4" />
          {intakeType.label}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "source",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Source" />
    ),
    enableSorting: false,
    cell: ({ row }) => {
      const source = describeSource(row.original);
      if (!source) {
        return <span className="text-muted-foreground">N/A</span>;
      }
      return (
        <div className="flex max-w-125 items-center gap-2">
          <span className="truncate font-medium">{source.name}</span>
          <Badge variant="outline" className="shrink-0">
            {source.label}
          </Badge>
        </div>
      );
    },
  },
  {
    // An explicit id: a dotted accessorKey would sort as "staffMember_name",
    // which the server does not know and would answer newest first.
    accessorFn: (row) => row.staffMember.name,
    id: "staffMember",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Recorded By" />
    ),
    meta: {
      displayName: "Recorded By",
    },
    cell: ({ row }) => <span>{row.original.staffMember.name}</span>,
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} canManage={canManage} />,
  },
];
