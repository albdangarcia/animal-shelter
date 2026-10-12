import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import { MEDICAL_ITEM_KIND_LABELS } from "@/app/lib/constants/medical";
import {
  UPCOMING_DAYS,
  dueBucket,
  type MedicalDueBucket,
} from "@/app/lib/data/medical-due-groups";
import type {
  MedicalDueGroup,
  MedicalDueListRow,
} from "@/app/lib/data/medical-due.data";
import {
  formatShelterDay,
  shelterDaysBetweenKeys,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import { ScheduledEntryActions } from "@/components/dashboard/animals/medical/scheduled-entry-actions";
import { DUE_HEADING_ID } from "@/components/dashboard/animals/medical/use-entry-dialog-focus";

// Rendered on the server: overdue and due today are worked out against the
// shelter's today, passed in, not the browser's clock.

export const MEDICAL_DUE_TITLE = "Medical Care Due";
export const MEDICAL_DUE_DESCRIPTION = `Vaccines, tests and treatments that are overdue, due today or due in the next ${UPCOMING_DAYS} days, by where each animal is.`;

const kindOptions = Object.values(MedicalEntryKind).map((kind) => ({
  value: kind,
  label: MEDICAL_ITEM_KIND_LABELS[kind],
}));

const BUCKET_TITLES: Record<MedicalDueBucket, string> = {
  OVERDUE: "Overdue",
  TODAY: "Today",
  UPCOMING: "Upcoming",
};

const GROUP_LABELS: Record<MedicalDueGroup["type"], string | null> = {
  UNIT: "Location",
  FOSTER: "In foster with",
  NOT_HOUSED: null,
};

interface Props {
  groups: MedicalDueGroup[];
  today: CalendarDay;
  /** Whether the URL filters the list by kind, for the empty state. */
  filtered: boolean;
  canManage: boolean;
  canAdminister: boolean;
}

export function MedicalDue({
  groups,
  today,
  filtered,
  canManage,
  canAdminister,
}: Props) {
  return (
    <Card className="@container/main">
      <CardHeader>
        <CardTitle className="@[650px]/main:text-xl">
          {/* Takes focus when a row leaves the list, button and all. */}
          <h1 id={DUE_HEADING_ID} tabIndex={-1}>
            {MEDICAL_DUE_TITLE}
          </h1>
        </CardTitle>
        <CardDescription>{MEDICAL_DUE_DESCRIPTION}</CardDescription>
        <div className="mt-4 flex flex-row flex-wrap items-center gap-3">
          <ServerSideFacetedFilter
            title="Kind"
            paramKey="kind"
            options={kindOptions}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        {groups.length > 0 ? (
          groups.map((group) => (
            <DueGroup
              key={group.key}
              group={group}
              today={today}
              canManage={canManage}
              canAdminister={canAdminister}
            />
          ))
        ) : (
          <div className="text-center py-12 px-6 border-2 border-dashed rounded-lg">
            <p className="font-semibold text-lg">
              Nothing due in the next {UPCOMING_DAYS} days.
            </p>
            {filtered && (
              <p className="text-sm mt-1 text-muted-foreground">
                Nothing of the kinds picked, at least.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DueGroup({
  group,
  today,
  canManage,
  canAdminister,
}: {
  group: MedicalDueGroup;
  today: CalendarDay;
  canManage: boolean;
  canAdminister: boolean;
}) {
  const headingId = `due-group-${group.key}`;
  const label = GROUP_LABELS[group.type];
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      <div>
        {label && (
          <p className="text-xs text-muted-foreground">{label}</p>
        )}
        <h2 id={headingId} className="text-lg font-semibold">
          {group.title}
        </h2>
      </div>
      {group.sections.map((section) => {
        const sectionId = `${headingId}-${section.bucket}`;
        return (
          <section
            key={section.bucket}
            aria-labelledby={sectionId}
            className="space-y-2"
          >
            <h3 id={sectionId} className="text-sm font-medium">
              {BUCKET_TITLES[section.bucket]}
            </h3>
            <ul className="space-y-2">
              {section.rows.map((row) => (
                <DueRow
                  key={row.entry.id}
                  row={row}
                  today={today}
                  canManage={canManage}
                  canAdminister={canAdminister}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

const overdueText = (dueDate: CalendarDay, today: CalendarDay) => {
  const days = shelterDaysBetweenKeys(dueDate, today);
  return `${days} ${days === 1 ? "day" : "days"} overdue`;
};

function DueRow({
  row,
  today,
  canManage,
  canAdminister,
}: {
  row: MedicalDueListRow;
  today: CalendarDay;
  canManage: boolean;
  canAdminister: boolean;
}) {
  const { entry, animal, place } = row;
  const bucket = dueBucket(entry.dueDate, today);
  const where = [animal.species, place.type === "UNIT" ? place.unitName : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className="rounded-lg border p-3"
      aria-label={`${animal.name}: ${entry.item.name}, due ${formatShelterDay(entry.dueDate)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <Link
              href={`/dashboard/animals/${animal.id}/medical`}
              className="font-semibold underline-offset-4 hover:underline"
            >
              {animal.name}
            </Link>
            <span className="text-sm text-muted-foreground">{where}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{entry.item.name}</span>
            <Badge variant="outline">{MEDICAL_ITEM_KIND_LABELS[entry.kind]}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Due {formatShelterDay(entry.dueDate)}
          </span>
          {bucket === "OVERDUE" && (
            <Badge variant="destructive">
              {overdueText(entry.dueDate, today)}
            </Badge>
          )}
          {bucket === "TODAY" && <Badge>Due today</Badge>}
        </div>
      </div>
      <ScheduledEntryActions
        animalId={animal.id}
        entry={entry}
        animalName={animal.name}
        today={today}
        canManage={canManage}
        canAdminister={canAdminister}
      />
    </li>
  );
}
