import Link from "next/link";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatDateOrNA,
  isFosterPlacementOverdue,
} from "@/app/lib/utils/date-utils";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { AnimalSectionCardPayload } from "@/app/lib/types";
import { FosterPlacementType } from "@/prisma/generated/enums";

type OpenPlacement = AnimalSectionCardPayload["fosterPlacements"][number];

interface Props {
  placement: OpenPlacement;
  // the "in foster" fact shows wherever location shows,
  // but the foster's identity (name, link) is gated behind FOSTERS_READ.
  canReadFosters: boolean;
  canManageFosters: boolean;
}

// Layout-header banner shown whenever an animal has an open foster placement.
// Mirrors the health-status alert's prominence, but stays informational for
// everyone and only grows action buttons for staff who can manage fosters.
export function FosterPlacementBanner({
  placement,
  canReadFosters,
  canManageFosters,
}: Props) {
  const fosterName = placement.fosterProfile.person.name;
  // Staff-facing surface: this is the same condition that puts the placement
  // in the attention queue, so the two always agree on the same animal.
  const isOverdue = isFosterPlacementOverdue(placement.expectedEndDate);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40 @xl/main:flex-row @xl/main:items-center @xl/main:justify-between">
      <div className="flex items-start gap-2 text-sm">
        <Home className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
        <p className="text-blue-900 dark:text-blue-100">
          In foster with{" "}
          {canReadFosters ? (
            <Link
              href={`/dashboard/people-directory/${placement.fosterProfile.person.id}/fostering`}
              className="font-semibold underline underline-offset-2"
            >
              {fosterName}
            </Link>
          ) : (
            <span className="font-semibold">a foster</span>
          )}{" "}
          since {formatDateOrNA(placement.startDate)} ·{" "}
          {formatSingleEnumOption(placement.type)}
          {placement.expectedEndDate && (
            <>
              {" · "}expected return{" "}
              {formatDateOrNA(placement.expectedEndDate)}
              {isOverdue && (
                <Badge
                  variant="outline"
                  className="ml-1.5 border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                >
                  Overdue
                </Badge>
              )}
            </>
          )}
        </p>
      </div>

      {canManageFosters && (
        <div className="flex shrink-0 gap-2">
          {placement.type === FosterPlacementType.FOSTER_TO_ADOPT && (
            <Button asChild size="sm" variant="outline">
              <Link
                href={`/dashboard/fosters/placements/${placement.id}/convert`}
              >
                Convert to Adoption
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/fosters/placements/${placement.id}/return`}>
              Return from Foster
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
