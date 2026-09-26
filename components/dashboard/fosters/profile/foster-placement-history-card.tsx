import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
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
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { FosterProfileForTab } from "@/app/lib/data/fosters/fosters.data";
import { FosterReturnReason } from "@/prisma/generated/enums";

type Placement = FosterProfileForTab["placements"][number];

interface FosterPlacementHistoryCardProps {
  placements: Placement[];
}

// A placement ended by an outcome recorded while the animal was in foster
// says what the outcome was ("Ended: deceased"), which the reason alone does
// not. It falls back to the reason if the outcome is gone.
//
// Reversing the outcome reopens the placement only when that outcome is what
// archived the animal. One reversed after a later re-intake leaves the
// placement ended and linked to it, so the row says the outcome was reversed
// rather than reading as if it stood.
const describeEnd = (placement: Placement) => {
  if (
    placement.returnReason !== FosterReturnReason.ENDED_BY_OUTCOME ||
    !placement.outcome
  ) {
    return formatSingleEnumOption(placement.returnReason);
  }
  const type = formatSingleEnumOption(placement.outcome.type).toLowerCase();
  return placement.outcome.reversedAt
    ? `Ended: ${type} (reversed)`
    : `Ended: ${type}`;
};

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
                  <TableCell>
                    {formatShelterDayOrNA(placement.startDate)}
                  </TableCell>
                  <TableCell>
                    {placement.endDate ? (
                      formatShelterDayOrNA(placement.endDate)
                    ) : (
                      <span className="text-muted-foreground italic">
                        Ongoing
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {placement.returnReason ? (
                      describeEnd(placement)
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
