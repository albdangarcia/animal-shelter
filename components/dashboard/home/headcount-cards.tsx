import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import {
  HEADCOUNT_PERMISSIONS,
  fetchHeadcounts,
} from "@/app/lib/data/analytics.data";
import {
  draftsLine,
  fosterToAdoptLine,
  inCareLine,
  spaceLine,
} from "@/app/lib/utils/headcounts";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HEADCOUNT_GRID_CLASS } from "./headcount-grid";

const HeadcountCard = ({
  title,
  value,
  spokenValue,
  detail,
  href,
  linkLabel,
}: {
  title: string;
  value: string;
  /** Read out instead of `value` when the figure alone is unclear. */
  spokenValue?: string;
  detail: string;
  href: string;
  linkLabel: string;
}) => (
  <Card className="@container/card">
    <CardHeader>
      <CardTitle role="heading" aria-level={2} className="text-sm">
        {title}
      </CardTitle>
      <p className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
        {spokenValue ? (
          <>
            <span aria-hidden>{value}</span>
            <span className="sr-only">{spokenValue}</span>
          </>
        ) : (
          value
        )}
      </p>
      <CardDescription>{detail}</CardDescription>
    </CardHeader>
    <CardFooter className="mt-auto">
      <Link
        href={href}
        className="text-primary inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
      >
        {linkLabel}
        <IconChevronRight className="size-4" aria-hidden />
      </Link>
    </CardFooter>
  </Card>
);

/**
 * Row 1 of the dashboard: where the animals are now. In care and Space count
 * as the shelter board does (`countHeadcounts`), so the two pages agree.
 * Left out for a viewer without every permission its fetch needs
 * (`HEADCOUNT_PERMISSIONS`).
 */
const HeadcountCards = async () => {
  const allowed = await Promise.all(
    HEADCOUNT_PERMISSIONS.map((permission) => hasPermission(permission)),
  );
  if (allowed.includes(false)) return null;

  const counts = await fetchHeadcounts();

  return (
    <div className={HEADCOUNT_GRID_CLASS}>
      <HeadcountCard
        title="In care"
        value={String(counts.inCare)}
        detail={inCareLine(counts.onSite, counts.inFoster, counts.notHoused)}
        href="/dashboard/locations"
        linkLabel="Open the shelter board"
      />
      <HeadcountCard
        title="Available"
        value={String(counts.published)}
        detail={draftsLine(counts.drafts)}
        href="/dashboard/animals?listingStatus=PUBLISHED"
        linkLabel="List available animals"
      />
      <HeadcountCard
        title="Pending adoption"
        value={String(counts.pendingAdoption)}
        detail={fosterToAdoptLine(counts.fosterToAdopt)}
        href="/dashboard/animals?listingStatus=PENDING_ADOPTION"
        linkLabel="List pending adoptions"
      />
      <HeadcountCard
        title="Space"
        value={`${counts.units.occupied} / ${counts.units.capacity}`}
        spokenValue={`${counts.units.occupied} on site, ${counts.units.capacity} places`}
        detail={spaceLine(counts.units)}
        href="/dashboard/locations"
        linkLabel="See the units"
      />
    </div>
  );
};

export default HeadcountCards;
