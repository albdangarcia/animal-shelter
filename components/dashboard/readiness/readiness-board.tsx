import type { ReactNode } from "react";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconClipboardX,
  IconMedicalCross,
  IconPhotoOff,
  IconStethoscope,
  IconTagOff,
  type TablerIcon,
} from "@tabler/icons-react";
import type { ReadinessBlocker } from "@/app/lib/readiness/compute-readiness";
import {
  blockerAction,
  describeBlocker,
  formatShelterDate,
  stageLabel,
  type ReadinessBlockerKind,
  type ReadinessBoard as ReadinessBoardData,
  type ReadinessBoardFilterOptions,
  type ReadinessBoardRow,
  type ReadinessPlacement,
  type ReadinessViewerCan,
} from "@/app/lib/readiness/board";
import { SimplePagination } from "@/components/simple-pagination";
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
import { cn } from "@/lib/utils";
import { ReadinessBoardToolbar } from "./readiness-board-toolbar";

// Rendered on the server only: day counts and dates are computed against the
// request's clock and the shelter's timezone, so nothing re-renders them in
// the browser with a different "now".

export const KIND_META: Record<
  ReadinessBlockerKind,
  { title: string; description: string; icon: TablerIcon; urgent?: boolean }
> = {
  ESCALATED_FINDING: {
    title: "Escalated findings",
    description:
      "The latest check of a template was escalated. Review the finding; a later, calmer check of the same template clears it.",
    icon: IconAlertTriangle,
    urgent: true,
  },
  ACUTE_HEALTH: {
    title: "Acute health",
    description:
      "Under or awaiting veterinary care. Clears when the health status is updated.",
    icon: IconStethoscope,
    urgent: true,
  },
  UNSUPPORTED_CHARACTERISTIC: {
    title: "Unsupported characteristics",
    description:
      "A trait on the profile that a live finding contradicts, or whose citing assessment was deleted or no longer supports it.",
    icon: IconTagOff,
  },
  MISSING_ASSESSMENT: {
    title: "Missing assessments",
    description: "Required checks with nothing on file for the current stay.",
    icon: IconClipboardX,
  },
  NOT_SPAYED_NEUTERED: {
    title: "Not spayed or neutered",
    description: "The procedure isn't recorded on the profile yet.",
    icon: IconMedicalCross,
  },
  NO_PHOTO: {
    title: "No photo",
    description: "Nothing for adopters to see yet.",
    icon: IconPhotoOff,
  },
};

const groupAnchor = (kind: ReadinessBlockerKind) =>
  `readiness-${kind.toLowerCase().replace(/_/g, "-")}`;

const placementLabel = (placement: ReadinessPlacement): string => {
  switch (placement.kind) {
    case "UNIT":
      return `${placement.locationName} · ${placement.unitName}`;
    case "FOSTER":
      return "In foster";
    case "UNPLACED":
      return "Unplaced";
  }
};

// A blocker's identity within its row: enough to keep React keys unique when
// one animal carries several of the same kind.
export const blockerKey = (blocker: ReadinessBlocker): string => {
  switch (blocker.kind) {
    case "MISSING_ASSESSMENT":
      return blocker.templateKey;
    case "ESCALATED_FINDING":
      return blocker.assessmentId;
    case "UNSUPPORTED_CHARACTERISTIC":
      return `${blocker.characteristicId}-${blocker.issue}`;
    default:
      return blocker.kind;
  }
};

/** The board's own query params a link needs to carry over: which filters
 *  are applied, and optionally which group to drill into. Read straight off
 *  `searchParams` by the server page, so this never re-derives anything the
 *  toolbar's client-side filters already decided. */
export interface ReadinessFilterParams {
  species?: string;
  location?: string;
  stage?: string;
}

function boardHref(
  filterParams: ReadinessFilterParams,
  overrides: { kind?: ReadinessBlockerKind } = {},
): string {
  const params = new URLSearchParams();
  if (filterParams.species) params.set("species", filterParams.species);
  if (filterParams.location) params.set("location", filterParams.location);
  if (filterParams.stage) params.set("stage", filterParams.stage);
  if (overrides.kind) params.set("kind", overrides.kind);
  const query = params.toString();
  return query ? `/dashboard/readiness?${query}` : "/dashboard/readiness";
}

function BlockedFor({ row }: { row: ReadinessBoardRow }) {
  if (row.since === null || row.blockedDays === null) {
    return (
      <span className="text-muted-foreground" title="The app doesn't record when this began.">
        Not dated
      </span>
    );
  }
  const days = row.blockedDays;
  return (
    <div className="flex flex-col">
      <span className="font-medium tabular-nums">
        {days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
      </span>
      <time
        dateTime={row.since.toISOString()}
        className="text-xs text-muted-foreground"
      >
        since {formatShelterDate(row.since)}
      </time>
    </div>
  );
}

/** One group's header + row table, shared by the overview's per-group
 *  preview and the `?kind=` detail page's full, paginated list — `rows` is
 *  already sliced to whichever the caller wants, `totalCount` is always the
 *  true count so the badge never quietly shrinks to match the slice. */
function GroupSection({
  kind,
  rows,
  totalCount,
  can,
  footer,
}: {
  kind: ReadinessBlockerKind;
  rows: ReadinessBoardRow[];
  totalCount: number;
  can: ReadinessViewerCan;
  footer?: ReactNode;
}) {
  const meta = KIND_META[kind];
  const headingId = `${groupAnchor(kind)}-heading`;
  const Icon = meta.icon;

  return (
    <section
      id={groupAnchor(kind)}
      aria-labelledby={headingId}
      className="scroll-mt-4 rounded-lg border"
    >
      <div className="flex flex-col gap-1 border-b px-4 py-3">
        <h2
          id={headingId}
          className="flex items-center gap-2 text-base font-semibold"
        >
          <Icon
            className={cn(
              "size-4",
              meta.urgent
                ? "text-red-600 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          />
          {meta.title}
          <Badge variant="secondary" className="tabular-nums">
            {totalCount}
          </Badge>
        </h2>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </div>
      {rows.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Animal</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Outstanding for</TableHead>
                <TableHead className="pr-4">What clears it</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.animal.id} className="align-top">
                  <TableCell className="pl-4">
                    <Link
                      href={`/dashboard/animals/${row.animal.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.animal.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {row.animal.species}
                    </div>
                  </TableCell>
                  <TableCell>{placementLabel(row.animal.placement)}</TableCell>
                  <TableCell>{stageLabel(row.animal.listingStatus)}</TableCell>
                  <TableCell>
                    <BlockedFor row={row} />
                  </TableCell>
                  <TableCell className="pr-4 whitespace-normal">
                    <ul
                      className={cn(
                        "flex gap-1.5",
                        // Missing checks are short and often several; let them
                        // share a line.
                        kind === "MISSING_ASSESSMENT"
                          ? "flex-row flex-wrap gap-x-4"
                          : "flex-col",
                      )}
                    >
                      {row.blockers.map((blocker) => {
                        const action = blockerAction(blocker, row.animal.id, can);
                        // "Record Cat Test" already names the missing check.
                        const named =
                          blocker.kind === "MISSING_ASSESSMENT" &&
                          can.manageAssessments;
                        return (
                          <li
                            key={blockerKey(blocker)}
                            className="flex flex-wrap items-baseline gap-x-2"
                          >
                            {!named && <span>{describeBlocker(blocker)}</span>}
                            <Link
                              href={action.href}
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
                            >
                              {action.label}
                              <IconArrowRight className="size-3.5" aria-hidden />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {footer}
        </>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing here matches these filters.
        </p>
      )}
    </section>
  );
}

function KindSummary({
  board,
  filterParams,
}: {
  board: Extract<ReadinessBoardData, { view: "overview" }>;
  filterParams: ReadinessFilterParams;
}) {
  return (
    <nav aria-label="Outstanding items by kind">
      <ul className="grid grid-cols-2 gap-2 @xl/main:grid-cols-4 @5xl/main:grid-cols-6">
        {board.groups.map((group) => {
          const meta = KIND_META[group.kind];
          const Icon = meta.icon;
          const count = group.totalCount;
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                {meta.title}
              </span>
              <span className="text-2xl font-semibold tabular-nums">
                {count}
              </span>
            </>
          );
          return (
            <li key={group.kind}>
              {count > 0 ? (
                <Link
                  href={boardHref(filterParams, { kind: group.kind })}
                  className={cn(
                    "flex h-full flex-col gap-1 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent",
                    meta.urgent &&
                      "border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:hover:bg-red-950/60",
                  )}
                >
                  {body}
                </Link>
              ) : (
                <div className="flex h-full flex-col gap-1 rounded-lg border border-dashed px-3 py-2 opacity-60">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function OverviewGroups({
  board,
  can,
  filterParams,
}: {
  board: Extract<ReadinessBoardData, { view: "overview" }>;
  can: ReadinessViewerCan;
  filterParams: ReadinessFilterParams;
}) {
  const groups = board.groups.filter((g) => g.totalCount > 0);

  return (
    <>
      <KindSummary board={board} filterParams={filterParams} />

      {groups.length > 0 ? (
        groups.map((group) => (
          <GroupSection
            key={group.kind}
            kind={group.kind}
            rows={group.rows}
            totalCount={group.totalCount}
            can={can}
            footer={
              group.totalCount > group.rows.length ? (
                <div className="border-t px-4 py-2.5">
                  <Link
                    href={boardHref(filterParams, { kind: group.kind })}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Show all {group.totalCount}
                    <IconArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              ) : undefined
            }
          />
        ))
      ) : (
        <div className="rounded-lg border-2 border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {board.animalCount === 0
              ? "No animals match these filters."
              : "Every animal that matches these filters is ready."}
          </p>
        </div>
      )}
    </>
  );
}

function DetailGroup({
  board,
  can,
}: {
  board: Extract<ReadinessBoardData, { view: "detail" }>;
  can: ReadinessViewerCan;
}) {
  return (
    <GroupSection
      kind={board.kind}
      rows={board.rows}
      totalCount={board.totalRows}
      can={can}
      footer={
        board.totalPages > 1 ? (
          <div className="border-t px-4 py-3">
            <SimplePagination totalPages={board.totalPages} />
          </div>
        ) : undefined
      }
    />
  );
}

interface Props {
  board: ReadinessBoardData;
  filterOptions: ReadinessBoardFilterOptions;
  can: ReadinessViewerCan;
  filterParams: ReadinessFilterParams;
}

export function ReadinessBoard({ board, filterOptions, can, filterParams }: Props) {
  const ready = board.animalCount - board.blockedCount;

  return (
    <Card className="@container/main">
      <CardHeader>
        <CardTitle className="@[650px]/main:text-xl">
          <h1>Readiness Board</h1>
        </CardTitle>
        <CardDescription>
          What&apos;s still outstanding before each animal is fully ready for
          adoption, and what clears it.
          Longest-outstanding first within each group.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ReadinessBoardToolbar options={filterOptions} />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-medium text-foreground tabular-nums">
              {board.blockedCount}
            </span>{" "}
            of {board.animalCount}{" "}
            {board.animalCount === 1 ? "animal" : "animals"} not ready ·{" "}
            <span className="tabular-nums">{ready}</span> ready
          </p>
        </div>

        {board.view === "overview" ? (
          <OverviewGroups board={board} can={can} filterParams={filterParams} />
        ) : (
          <DetailGroup board={board} can={can} />
        )}
      </CardContent>
    </Card>
  );
}
