import Link from "next/link";
import { IconArrowUpRight } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import {
  fetchBalanceSummary,
  fetchIntakeSummary,
  fetchLengthOfStaySummary,
  fetchOutcomeSummary,
} from "@/app/lib/data/reports/reports-overview.data";

// Raw URL params flowed down to each card so it can run its own fetch (letting
// the cards stream independently) and build a link that preserves the range.
export type OverviewCardParams = {
  from?: string;
  to?: string;
  species?: string;
};

/** Builds a detail-report href that carries the current range/species params. */
function reportHref(base: string, { from, to, species }: OverviewCardParams) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (species) params.set("species", species);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Shared card presentation. When `href` is set the whole card is a link with a
 * hover affordance; the balance card omits it (informational only).
 */
function ReportCard({
  label,
  headline,
  sub,
  badges,
  href,
}: {
  label: string;
  headline: string;
  sub?: string;
  badges: string[];
  href?: string;
}) {
  const card = (
    <Card
      className={`@container/card h-full ${href ? "transition-colors hover:border-primary/40" : ""}`}
    >
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums @[250px]/card:text-3xl">
          {headline}
        </CardTitle>
        {href && (
          <CardAction>
            <IconArrowUpRight className="size-4 text-muted-foreground" />
          </CardAction>
        )}
      </CardHeader>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        {sub && <div className="text-muted-foreground">{sub}</div>}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <Badge key={badge} variant="outline" className="font-normal">
                {badge}
              </Badge>
            ))}
          </div>
        )}
      </CardFooter>
    </Card>
  );

  if (!href) return card;
  return (
    <Link href={href} className="block h-full">
      {card}
    </Link>
  );
}

/** Live release rate + top outcome types. Links to the outcomes detail report. */
export async function OutcomeStatisticsCard(params: OverviewCardParams) {
  const { total, liveReleaseRate, topTypes } = await fetchOutcomeSummary(
    params.from,
    params.to,
    params.species,
  );

  return (
    <ReportCard
      href={reportHref("/dashboard/reports/outcomes", params)}
      label="Outcome statistics"
      headline={`${(liveReleaseRate * 100).toFixed(1)}%`}
      sub={
        total === 0
          ? "No outcomes in this period"
          : `Live release rate · ${total} total outcomes`
      }
      badges={topTypes.map(
        (t) => `${formatSingleEnumOption(t.type)} · ${t.count}`,
      )}
    />
  );
}

/** Intakes in / outcomes out with the net balance. Informational (no link). */
export async function IntakeVsOutcomeCard(params: OverviewCardParams) {
  const { intakes, outcomes, net } = await fetchBalanceSummary(
    params.from,
    params.to,
    params.species,
  );

  const netLabel = `Net ${net >= 0 ? "+" : "−"}${Math.abs(net)} in care over period`;

  return (
    <ReportCard
      label="Intake vs outcome"
      headline={`${intakes} in / ${outcomes} out`}
      sub={netLabel}
      badges={[]}
    />
  );
}

/** Median LOS plus in-care worklist counts. Links to the LOS detail report. */
export async function LengthOfStayCard(params: OverviewCardParams) {
  const { medianDays, inCareNow, over90 } = await fetchLengthOfStaySummary(
    params.from,
    params.to,
    params.species,
  );

  return (
    <ReportCard
      href={reportHref("/dashboard/reports/length-of-stay", params)}
      label="Length of stay"
      headline={medianDays === null ? "—" : `${medianDays} days`}
      sub="Median · completed stays in period"
      badges={[`${over90} over 90 days`, `${inCareNow} in care now`]}
    />
  );
}

/** Total intakes + top intake types. Links to the intakes detail report. */
export async function IntakeSourcesCard(params: OverviewCardParams) {
  const { total, topTypes } = await fetchIntakeSummary(
    params.from,
    params.to,
    params.species,
  );

  return (
    <ReportCard
      href={reportHref("/dashboard/reports/intakes", params)}
      label="Intake sources"
      headline={`${total}`}
      sub="Total intakes"
      badges={topTypes.map(
        (t) => `${formatSingleEnumOption(t.type)} · ${t.count}`,
      )}
    />
  );
}

/** Per-card skeleton shown while an individual card's query is in flight. */
export function OverviewCardSkeleton() {
  return (
    <Card className="@container/card h-full">
      <CardHeader>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-1 h-8 w-24" />
      </CardHeader>
      <CardFooter className="flex-col items-start gap-2">
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
      </CardFooter>
    </Card>
  );
}
