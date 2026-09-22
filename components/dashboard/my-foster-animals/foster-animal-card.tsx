import {
  calendarDay,
  formatShelterDayOrNA,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import Image from "next/image";
import Link from "next/link";
import { AnimalListingStatus } from "@/prisma/generated/enums";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  calculateAgeString,
  isFosterPlacementOverdue,
} from "@/app/lib/utils/date-utils";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { MyFosterPlacementPayload } from "@/app/lib/data/fosters/my-foster-animals.data";

const publiclyListedStatuses: AnimalListingStatus[] = [
  AnimalListingStatus.PUBLISHED,
  AnimalListingStatus.PENDING_ADOPTION,
];

interface Props {
  placement: MyFosterPlacementPayload;
  /** Today on the shelter's calendar, resolved on the server. */
  today: CalendarDay;
}

export function FosterAnimalCard({ placement, today }: Props) {
  const { animal } = placement;
  const photo = animal.animalImages[0]?.url;
  const breedString = animal.breeds.map((b) => b.name).join(", ");
  const isPubliclyListed = publiclyListedStatuses.includes(
    animal.listingStatus,
  );

  return (
    <Card className="@container/card">
      <CardContent className="flex gap-4">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary">
          {photo ? (
            <Image
              src={photo}
              alt={`Photo of ${animal.name}`}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <span className="text-3xl">🐾</span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {isPubliclyListed ? (
              <Link
                href={`/pets/${animal.id}`}
                className="font-semibold hover:underline"
              >
                {animal.name}
              </Link>
            ) : (
              <span className="font-semibold">{animal.name}</span>
            )}
            <Badge variant="outline">
              {formatSingleEnumOption(placement.type)}
            </Badge>
          </div>

          <p className="text-muted-foreground">
            {animal.species.name}
            {breedString && ` · ${breedString}`} ·{" "}
            {calculateAgeString({ birthDate: calendarDay(animal.birthDate), simple: true })}
          </p>

          <p className="text-muted-foreground">
            Since {formatShelterDayOrNA(placement.startDate)}
            {placement.expectedEndDate && (
              <>
                {" · "}Expected return{" "}
                {formatShelterDayOrNA(placement.expectedEndDate)}
                {/* The foster's own view, not staff's: the date is an estimate
                    the shelter set, so state the fact plainly rather than
                    flagging a volunteer as "Overdue". */}
                {isFosterPlacementOverdue(placement.expectedEndDate, today) && (
                  <span className="text-foreground/80"> (date passed)</span>
                )}
              </>
            )}
          </p>

          <p className="text-xs text-muted-foreground italic">
            Questions? Contact the shelter.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
