import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { MyFosterPlacementPayload } from "@/app/lib/data/fosters/my-foster-animals.data";

interface Props {
  placements: MyFosterPlacementPayload[];
}

export function PastFostersCard({ placements }: Props) {
  if (placements.length === 0) return null;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Past fosters</CardTitle>
        <CardDescription>Your most recent completed placements.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {placements.map((placement) => (
            <li
              key={placement.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{placement.animal.name}</span>
                <Badge variant="outline">
                  {formatSingleEnumOption(placement.type)}
                </Badge>
              </div>
              <span className="text-muted-foreground">
                {formatDateOrNA(placement.startDate)} –{" "}
                {formatDateOrNA(placement.endDate)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
