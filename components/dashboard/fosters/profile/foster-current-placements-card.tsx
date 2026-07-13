import Link from "next/link";
import { FosterPlacementType } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { FosterProfileForTab } from "@/app/lib/data/fosters/fosters.data";

interface FosterCurrentPlacementsCardProps {
  fosterProfileId: string;
  placements: FosterProfileForTab["placements"];
  canManage: boolean;
  canPlaceMore: boolean;
}

export function FosterCurrentPlacementsCard({
  fosterProfileId,
  placements,
  canManage,
  canPlaceMore,
}: FosterCurrentPlacementsCardProps) {
  const openPlacements = placements.filter((p) => p.endDate === null);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Current Placements
        </CardTitle>
        <CardDescription>
          Animals currently in this foster&apos;s care.
        </CardDescription>
        {canManage && canPlaceMore && (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/dashboard/fosters/placements/new?fosterProfileId=${fosterProfileId}`}
              >
                New Placement
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {openPlacements.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            Not currently fostering any animals.
          </p>
        ) : (
          <ul className="space-y-2">
            {openPlacements.map((placement) => (
              <li
                key={placement.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/animals/${placement.animal.id}`}
                    className="font-medium hover:underline"
                  >
                    {placement.animal.name}
                  </Link>
                  <Badge variant="outline">
                    {formatSingleEnumOption(placement.type)}
                  </Badge>
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/dashboard/fosters/placements/${placement.id}/return`}
                      >
                        Return
                      </Link>
                    </Button>
                    {placement.type === FosterPlacementType.FOSTER_TO_ADOPT && (
                      <Button asChild size="sm">
                        <Link
                          href={`/dashboard/fosters/placements/${placement.id}/convert`}
                        >
                          Convert to Adoption
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
