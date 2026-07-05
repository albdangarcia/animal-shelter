import Link from "next/link";

import type { LongestStayRow } from "@/app/lib/data/reports/length-of-stay-report.data";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The "longest current stays" worklist — animals in care now, ordered by their
 * current open-stay duration. Server-rendered plain shadcn table; the operational
 * payoff of the report. The cumulative column is only meaningful for animals
 * that have returned (prior stays), so it shows "same" otherwise.
 */
export function LongestStaysTable({ rows }: { rows: LongestStayRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Animal</TableHead>
          <TableHead>Species</TableHead>
          <TableHead className="text-right">Current stay (days)</TableHead>
          <TableHead className="text-right">Cumulative (days)</TableHead>
          <TableHead>Intake date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="text-muted-foreground text-center"
            >
              No animals are currently in care.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.animalId}>
              <TableCell className="font-medium">
                <Link
                  href={`/dashboard/animals/${row.animalId}`}
                  className="hover:underline"
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell>{row.speciesName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.currentStayDays}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">
                {row.hasPriorStays ? row.cumulativeDays : "same"}
              </TableCell>
              <TableCell>{formatDateOrNA(row.intakeDate)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
