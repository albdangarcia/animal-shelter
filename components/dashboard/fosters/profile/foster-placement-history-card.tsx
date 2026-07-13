import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { FosterProfileForTab } from "@/app/lib/data/fosters/fosters.data";

interface FosterPlacementHistoryCardProps {
  placements: FosterProfileForTab["placements"];
}

export function FosterPlacementHistoryCard({
  placements,
}: FosterPlacementHistoryCardProps) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Placement History
        </CardTitle>
        <CardDescription>
          Every placement recorded for this foster, most recent first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {placements.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            No placements recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Animal</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Return Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {placements.map((placement) => (
                <TableRow key={placement.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/animals/${placement.animal.id}`}
                      className="font-medium hover:underline"
                    >
                      {placement.animal.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {formatSingleEnumOption(placement.type)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateOrNA(placement.startDate)}</TableCell>
                  <TableCell>
                    {placement.endDate ? (
                      formatDateOrNA(placement.endDate)
                    ) : (
                      <span className="text-muted-foreground italic">
                        Ongoing
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {placement.returnReason ? (
                      formatSingleEnumOption(placement.returnReason)
                    ) : (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
