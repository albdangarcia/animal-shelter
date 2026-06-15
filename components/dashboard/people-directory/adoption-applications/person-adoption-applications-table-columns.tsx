"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import Image from "next/image";
import { DataTableColumnHeader } from "../../../table-common/data-table-column-header";
import { PersonAdoptionApplicationPayload } from "@/app/lib/data/people-directory/person-adoption-applications.data";
import { formatTimeAgo } from "@/app/lib/utils/date-utils";
import { userApplicationStatusOptions } from "@/app/lib/utils/enum-formatter";

export const columns: ColumnDef<PersonAdoptionApplicationPayload>[] = [
  {
    id: "animal",
    accessorFn: (row) => row.animal.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Animal" />
    ),
    meta: {
      displayName: "Animal",
    },
    cell: ({ row }) => {
      const animal = row.original.animal;
      const firstImage = animal.animalImages?.[0]?.url;

      return (
        <Link
          href={`/dashboard/animals/${animal.id}`}
          className="flex items-center gap-2 font-medium hover:underline"
        >
          <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border bg-secondary">
            {firstImage ? (
              <Image
                src={firstImage}
                alt={`Photo of ${animal.name}`}
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <span className="text-sm">🐾</span>
            )}
          </div>
          <span>{animal.name}</span>
        </Link>
      );
    },
  },
  {
    id: "animalSpecies",
    accessorFn: (row) => row.animal.species.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Species" />
    ),
    meta: {
      displayName: "Species",
    },
    cell: ({ row }) => (
      <span className="max-w-100 truncate">
        {row.original.animal.species.name}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = userApplicationStatusOptions.find(
        (option) => option.value === row.getValue("status"),
      );

      if (!status) return null;

      return (
        <Badge variant="outline" className="flex w-fit items-center">
          {status.label}
        </Badge>
      );
    },
  },
  {
    accessorKey: "submittedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Submitted" />
    ),
    meta: {
      displayName: "Submitted",
    },
    cell: ({ row }) => {
      const date = row.getValue("submittedAt") as string | Date | null;
      return <span>{formatTimeAgo(date)}</span>;
    },
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Last Updated" />
    ),
    meta: {
      displayName: "Last Updated",
    },
    cell: ({ row }) => {
      const date = row.getValue("updatedAt") as string | Date | null;
      return <span>{formatTimeAgo(date)}</span>;
    },
  },
];
