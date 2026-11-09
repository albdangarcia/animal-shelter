import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DOSE_SHEET_PAST_DAYS } from "@/app/lib/constants/medical";
import type {
  DoseSheetPage,
  DoseSheetViewGroup,
  DoseSheetViewRow,
  DoseSheetViewSection,
} from "@/app/lib/data/medication-doses.data";
import { doseSlotText, doseText } from "@/app/lib/services/medication-text";
import { sameNameDetails } from "@/app/lib/utils/medical-batch";
import {
  formatShelterDay,
  formatTimeOfDay,
  shiftDayKey,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import {
  DoseLine,
  OpenSlotText,
} from "@/components/dashboard/animals/medical/dose-sheet";
import {
  DoseSlotActions,
  type DoseControls,
} from "@/components/dashboard/animals/medical/dose-slot-actions";
import {
  DOSE_SHEET_HEADING_ID,
  DoseRowCheckbox,
  DoseSelection,
  RecordSelectedDosesButton,
  type SelectableDose,
} from "./dose-sheet-selection";

// Rendered on the server: which slots have ended, and the time each dose was
// given, are worked out on the shelter's clock, not the browser's.

export const DOSE_SHEET_TITLE = "Dose Sheet";
export const DOSE_SHEET_DESCRIPTION = `Every medication slot due on a day, AM, Midday and PM, and the as-needed orders running then, by where each animal is. Today, or up to ${DOSE_SHEET_PAST_DAYS} days back.`;

const DOSES_PATH = "/dashboard/medical/doses";

const GROUP_LABELS: Record<DoseSheetViewGroup["type"], string | null> = {
  UNIT: "Location",
  FOSTER: "In foster with",
  NOT_HOUSED: null,
};

/**
 * What tells each animal on the sheet from another of the same name, by id,
 * or null for a name no other animal there has.
 */
type SheetNames = Map<string, string | null>;

/** "Misty", or "Rex (Dog · male, orange, 1 year)" when the name is shared. */
const animalNameOf = ({ animal }: DoseSheetViewRow, names: SheetNames) => {
  const details = names.get(animal.id);
  return details ? `${animal.name} (${details})` : animal.name;
};

/** Where focus goes when a row's controls go: the row itself, which stays. */
const rowId = (row: DoseSheetViewRow) => `dose-sheet-row-${row.cell.key}`;

/** A slot that can be picked to record with others: one not recorded yet. An
 * as-needed order takes doses one at a time. */
const selectableOf = (
  row: DoseSheetViewRow,
  names: SheetNames,
): SelectableDose | null =>
  row.slot !== null && row.cell.recordable
    ? {
        key: row.cell.key,
        orderId: row.order.id,
        slotDate: row.cell.slotDate,
        slot: row.slot,
        animalName: animalNameOf(row, names),
        label: row.cell.label,
      }
    : null;

interface Props {
  page: DoseSheetPage;
  canAdminister: boolean;
}

export function DoseSheet({ page, canAdminister }: Props) {
  const rows = page.sections.flatMap((section) =>
    section.groups.flatMap((group) => group.rows),
  );
  const names = sameNameDetails(
    rows.map((row) => row.animal),
    page.today,
  );
  const selectable = canAdminister
    ? rows
        .map((row) => selectableOf(row, names))
        .filter((dose): dose is SelectableDose => dose !== null)
    : [];
  const controls: DoseControls | null = canAdminister
    ? {
        canAdminister,
        // Voids are made on the animal's own Medications page, which shows
        // voided doses too.
        canManage: false,
        // The sheet leaves out animals that left care.
        inCare: true,
        today: page.today,
        time: page.time,
      }
    : null;

  return (
    // A new day starts with nothing picked.
    <DoseSelection key={page.day} doses={selectable}>
      <Card className="@container/main">
        <CardHeader>
          <CardTitle className="@[650px]/main:text-xl">
            {/* Takes focus when the doses picked are recorded. */}
            <h1 id={DOSE_SHEET_HEADING_ID} tabIndex={-1}>
              {DOSE_SHEET_TITLE}
            </h1>
          </CardTitle>
          <CardDescription>{DOSE_SHEET_DESCRIPTION}</CardDescription>
          <DayNav page={page} />
          {page.refused && (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              The dose sheet goes back {DOSE_SHEET_PAST_DAYS} days and never
              ahead, so it shows today.
            </p>
          )}
          {selectable.length > 0 && (
            <div className="mt-4">
              <RecordSelectedDosesButton />
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:gap-6">
          {page.sections.length > 0 ? (
            page.sections.map((section) => (
              <SlotSection
                key={section.key}
                section={section}
                page={page}
                names={names}
                controls={controls}
              />
            ))
          ) : (
            <div className="text-center py-12 px-6 border-2 border-dashed rounded-lg">
              <p className="font-semibold text-lg">
                No medication doses on {formatShelterDay(page.day)}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </DoseSelection>
  );
}

const dayHref = (day: CalendarDay, today: CalendarDay) =>
  day === today ? DOSES_PATH : `${DOSES_PATH}?day=${day}`;

/** The day shown, with the day before and the day after while in range. */
function DayNav({ page }: { page: DoseSheetPage }) {
  const { day, today, earliest } = page;
  const before = shiftDayKey(day, -1);
  const after = shiftDayKey(day, 1);
  return (
    <nav aria-label="Days" className="mt-4 flex flex-wrap items-center gap-2">
      {before >= earliest ? (
        <Button asChild variant="outline" size="sm">
          <Link href={dayHref(before, today)} aria-label={`Previous day, ${formatShelterDay(before)}`}>
            <ChevronLeft className="size-4" />
            {formatShelterDay(before)}
          </Link>
        </Button>
      ) : null}
      <p className="text-sm font-medium" aria-current="date">
        {day === today ? `Today, ${formatShelterDay(day)}` : formatShelterDay(day)}
      </p>
      {after <= today ? (
        <Button asChild variant="outline" size="sm">
          <Link href={dayHref(after, today)} aria-label={`Next day, ${formatShelterDay(after)}`}>
            {formatShelterDay(after)}
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}

function SlotSection({
  section,
  page,
  names,
  controls,
}: {
  section: DoseSheetViewSection;
  page: DoseSheetPage;
  names: SheetNames;
  controls: DoseControls | null;
}) {
  const headingId = `dose-sheet-${section.key}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id={headingId} className="text-lg font-semibold">
          {section.title}
        </h2>
        {section.key !== "PRN" && (
          <p className="text-sm text-muted-foreground">
            ends at {formatTimeOfDay(page.ends[section.key])}
          </p>
        )}
      </div>
      {section.groups.map((group) => (
        <PlaceGroup
          key={group.key}
          group={group}
          headingId={`${headingId}-${group.key}`}
          names={names}
          controls={controls}
        />
      ))}
    </section>
  );
}

function PlaceGroup({
  group,
  headingId,
  names,
  controls,
}: {
  group: DoseSheetViewGroup;
  headingId: string;
  names: SheetNames;
  controls: DoseControls | null;
}) {
  const label = GROUP_LABELS[group.type];
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <div>
        {label && <p className="text-xs text-muted-foreground">{label}</p>}
        <h3 id={headingId} className="font-semibold">
          {group.title}
        </h3>
      </div>
      <ul className="space-y-2">
        {group.rows.map((row) => (
          <SheetRow key={row.key} row={row} names={names} controls={controls} />
        ))}
      </ul>
    </section>
  );
}

function SheetRow({
  row,
  names,
  controls,
}: {
  row: DoseSheetViewRow;
  names: SheetNames;
  controls: DoseControls | null;
}) {
  const { animal, place, order, cell } = row;
  const name = animalNameOf(row, names);
  const selectable = controls ? selectableOf(row, names) : null;
  // A name another animal on the sheet shares is told apart by its details.
  const where = [
    names.get(animal.id) ?? animal.species,
    place.type === "UNIT" ? place.unitName : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      id={rowId(row)}
      tabIndex={-1}
      aria-label={`${name}: ${cell.label}`}
      className="rounded-lg border p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          {selectable && <DoseRowCheckbox dose={selectable} />}
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <Link
                href={`/dashboard/animals/${animal.id}/medical/medications`}
                className="font-semibold underline-offset-4 hover:underline"
              >
                {animal.name}
              </Link>
              <span className="text-sm text-muted-foreground">{where}</span>
            </p>
            <p className="mt-1 text-sm">
              <span className="font-medium">{order.itemName}</span>{" "}
              {doseText(order.doseAmount, order.doseUnit, order.route)}
            </p>
            {order.instructions && (
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                {order.instructions}
              </p>
            )}
          </div>
        </div>
        <div className="min-w-0 text-sm">
          {cell.doses.length > 0 ? (
            <div className="space-y-1">
              {cell.doses.map((dose) => (
                <DoseLine key={dose.id} dose={dose} />
              ))}
            </div>
          ) : (
            <OpenSlotText slot={cell} />
          )}
        </div>
      </div>
      {controls && cell.recordable && (
        <div className="mt-2">
          <DoseSlotActions
            // The sheet lists many animals: the controls name this one.
            slot={{
              ...cell,
              label: `${order.itemName} for ${name}, ${doseSlotText(cell)}`,
            }}
            controls={controls}
            fallbackId={rowId(row)}
          />
        </div>
      )}
    </li>
  );
}
