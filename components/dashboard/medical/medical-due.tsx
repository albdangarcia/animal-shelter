import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { protocolSourceText } from "@/app/lib/utils/medical-protocol-text";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import {
  MEDICAL_ENTRY_KIND_LABELS,
  SPAY_NEUTER_EXEMPTION_REASON_LABELS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";
import {
  UPCOMING_DAYS,
  dueBucket,
  dueRowName,
  type MedicalDueBucket,
} from "@/app/lib/data/medical-due-groups";
import type {
  MedicalDueGroup,
  MedicalDueListRow,
  MedicalDueReviewRow,
  MedicalDueSectionRow,
} from "@/app/lib/data/medical-due.data";
import {
  formatShelterDay,
  shelterDaysBetweenKeys,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import { ScheduledEntryActions } from "@/components/dashboard/animals/medical/scheduled-entry-actions";
import { ExemptionReviewActions } from "@/components/dashboard/animals/medical/exemption-review-actions";
import { DUE_HEADING_ID } from "@/components/dashboard/animals/medical/use-entry-dialog-focus";
import { sameNameDetails } from "@/app/lib/utils/medical-batch";
import { medicalEntryName } from "@/app/lib/utils/medical-entry-name";
import {
  DueRowCheckbox,
  DueSelection,
  RecordSelectedButton,
  type SelectableDue,
} from "./due-selection";

// Rendered on the server: overdue and due today are worked out against the
// shelter's today, passed in, not the browser's clock.

export const MEDICAL_DUE_TITLE = "Medical Care Due";
export const MEDICAL_DUE_DESCRIPTION = `Vaccines, tests, treatments, surgeries, microchips and exams that are overdue, due today or due in the next ${UPCOMING_DAYS} days, and spay/neuter exemptions up for review, by where each animal is.`;

const kindOptions = Object.values(MedicalEntryKind).map((kind) => ({
  value: kind,
  label: MEDICAL_ENTRY_KIND_LABELS[kind],
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

/**
 * A row that can be picked to record with others: a vaccine or treatment,
 * for a viewer who may give scheduled care. Tests have results of their own,
 * and surgeries, microchips and exams details of their own, so they are
 * recorded one at a time.
 */
const selectableOf = (
  row: MedicalDueListRow,
  names: DueNames,
): SelectableDue | null => {
  const { entry } = row;
  if (
    (entry.kind !== MedicalEntryKind.VACCINE &&
      entry.kind !== MedicalEntryKind.TREATMENT) ||
    !entry.itemId
  ) {
    return null;
  }
  return {
    entryId: entry.id,
    animalId: row.animal.id,
    animalName: animalNameOf(row, names),
    itemId: entry.itemId,
    itemName: medicalEntryName(entry),
    kind: entry.kind,
    dueDate: entry.dueDate,
  };
};

/**
 * What tells each animal on the list from another of the same name, by id,
 * or null for a name no other animal there has.
 */
type DueNames = Map<string, string | null>;

/** "Misty", or "Rex (Dog · male, orange, 1 year)" when the name is shared. */
const animalNameOf = ({ animal }: MedicalDueSectionRow, names: DueNames) => {
  const details = names.get(animal.id);
  return details ? `${animal.name} (${details})` : animal.name;
};

export function MedicalDue({
  groups,
  today,
  filtered,
  canManage,
  canAdminister,
}: Props) {
  const rows = groups.flatMap((group) =>
    group.sections.flatMap((section) => section.rows),
  );
  const names = sameNameDetails(
    rows.map((row) => row.animal),
    today,
  );
  const selectable = canAdminister
    ? rows
        .map((row) => ("review" in row ? null : selectableOf(row, names)))
        .filter((entry): entry is SelectableDue => entry !== null)
    : [];
  return (
    <DueSelection entries={selectable}>
      <DueCard
        groups={groups}
        names={names}
        today={today}
        filtered={filtered}
        canManage={canManage}
        canAdminister={canAdminister}
      />
    </DueSelection>
  );
}

function DueCard({
  groups,
  names,
  today,
  filtered,
  canManage,
  canAdminister,
}: Props & { names: DueNames }) {
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
          {canAdminister && groups.length > 0 && <RecordSelectedButton />}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:gap-6">
        {groups.length > 0 ? (
          groups.map((group) => (
            <DueGroup
              key={group.key}
              group={group}
              names={names}
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
  names,
  today,
  canManage,
  canAdminister,
}: {
  group: MedicalDueGroup;
  names: DueNames;
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
              {section.rows.map((row) =>
                "review" in row ? (
                  <ReviewRow
                    key={row.entry.id}
                    row={row}
                    names={names}
                    today={today}
                    canManage={canManage}
                  />
                ) : (
                  <DueRow
                    key={row.entry.id}
                    row={row}
                    names={names}
                    today={today}
                    canManage={canManage}
                    canAdminister={canAdminister}
                  />
                ),
              )}
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

/** The animal's name, linking to its Medical page, and where it is. */
function RowAnimal({
  row,
  names,
}: {
  row: MedicalDueSectionRow;
  names: DueNames;
}) {
  const { animal, place } = row;
  // A name another animal on the list shares is told apart by its details.
  const where = [
    names.get(animal.id) ?? animal.species,
    place.type === "UNIT" ? place.unitName : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <Link
        href={`/dashboard/animals/${animal.id}/medical`}
        className="font-semibold underline-offset-4 hover:underline"
      >
        {animal.name}
      </Link>
      <span className="text-sm text-muted-foreground">{where}</span>
    </p>
  );
}

/** The day a row falls due, and how late it is. */
function RowDay({
  label,
  day,
  today,
}: {
  label: string;
  day: CalendarDay;
  today: CalendarDay;
}) {
  const bucket = dueBucket(day, today);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {label} {formatShelterDay(day)}
      </span>
      {bucket === "OVERDUE" && (
        <Badge variant="destructive">{overdueText(day, today)}</Badge>
      )}
      {bucket === "TODAY" && <Badge>Due today</Badge>}
    </div>
  );
}

/**
 * A spay/neuter exemption up for review: why the animal is exempt, and the
 * two ways to settle it, scheduling the spay or neuter or recording a new
 * exemption. Both plan care, so they are for a viewer who may manage it.
 */
function ReviewRow({
  row,
  names,
  today,
  canManage,
}: {
  row: MedicalDueReviewRow;
  names: DueNames;
  today: CalendarDay;
  canManage: boolean;
}) {
  const { entry, animal } = row;
  const name = animalNameOf(row, names);
  const reason = SPAY_NEUTER_EXEMPTION_REASON_LABELS[entry.exemptionReason];
  return (
    <li
      className="rounded-lg border p-3"
      aria-label={`${name}: ${dueRowName(row)}, review on ${formatShelterDay(entry.reviewDate)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <RowAnimal row={row} names={names} />
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{dueRowName(row)}</span>
            <Badge variant="outline">{MEDICAL_ENTRY_KIND_LABELS[entry.kind]}</Badge>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Exempt from {SURGERY_PROCEDURE_LABELS[entry.procedure].toLowerCase()}:{" "}
            {reason.toLowerCase()}
            {entry.declineReason && `. ${entry.declineReason}`}
          </p>
        </div>
        <RowDay label="Review on" day={entry.reviewDate} today={today} />
      </div>
      {canManage && (
        <ExemptionReviewActions
          animalId={animal.id}
          exemption={entry}
          animalName={name}
        />
      )}
    </li>
  );
}

function DueRow({
  row,
  names,
  today,
  canManage,
  canAdminister,
}: {
  row: MedicalDueListRow;
  names: DueNames;
  today: CalendarDay;
  canManage: boolean;
  canAdminister: boolean;
}) {
  const { entry, animal } = row;
  const selectable = canAdminister ? selectableOf(row, names) : null;
  // A name another animal on the list shares is told apart by its details,
  // in the row and in every control that names it.
  const name = animalNameOf(row, names);

  return (
    <li
      className="rounded-lg border p-3"
      aria-label={`${name}: ${medicalEntryName(entry)}, due ${formatShelterDay(entry.dueDate)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-start gap-3">
          {selectable && <DueRowCheckbox entry={selectable} />}
          <div className="min-w-0">
            <RowAnimal row={row} names={names} />
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{medicalEntryName(entry)}</span>
              <Badge variant="outline">{MEDICAL_ENTRY_KIND_LABELS[entry.kind]}</Badge>
            </p>
            {entry.protocolStep && (
              <p className="mt-1 text-sm text-muted-foreground">
                {protocolSourceText(entry.protocolStep.protocol.name)}
              </p>
            )}
          </div>
        </div>
        <RowDay label="Due" day={entry.dueDate} today={today} />
      </div>
      <ScheduledEntryActions
        animalId={animal.id}
        entry={entry}
        animalName={name}
        today={today}
        canManage={canManage}
        canAdminister={canAdminister}
      />
    </li>
  );
}
