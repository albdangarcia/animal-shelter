import type { CSSProperties } from "react";
import { clsx } from "clsx";
import { DOSE_SLOT_LABELS } from "@/app/lib/constants/medical";
import type {
  DayView,
  DoseView,
  RunDayView,
  SlotView,
} from "@/app/lib/data/animals/medication.data";
import {
  formatShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import {
  DoseSlotActions,
  VoidDoseButton,
  type DoseControls,
} from "./dose-slot-actions";

/** What the viewer may do with doses, or null when they may only read. */
export const doseControlsOf = (
  controls: MedicalControls | null,
  today: CalendarDay,
  time: string,
): DoseControls | null =>
  controls && {
    canAdminister: controls.canAdminister,
    canManage: controls.canManage,
    inCare: controls.options.inCare,
    today,
    time,
  };

/** Where focus goes when a slot's controls go: the cell itself. */
export const doseCellId = (slot: SlotView) => `dose-slot-${slot.key}`;

// Refused and not given account for the slot, but someone should know.
const WARNING = "text-amber-700 dark:text-amber-300";

/** "Given 8:12 AM · Olivia Chen", "Refused: Spat it out", "Not given: …". */
export function DoseLine({ dose }: { dose: DoseView }) {
  const who = `${dose.givenAt} · ${dose.givenBy}`;
  return (
    <div className={clsx(dose.voided && "text-muted-foreground")}>
      {dose.result === "GIVEN" ? (
        <p className={clsx(dose.voided && "line-through")}>Given {who}</p>
      ) : (
        <>
          <p
            className={clsx(
              dose.voided ? "line-through" : WARNING,
              "font-medium",
            )}
          >
            {dose.result === "REFUSED" ? "Refused" : "Not given"}
            {dose.reason && `: ${dose.reason}`}
          </p>
          <p
            className={clsx(
              "text-xs text-muted-foreground",
              dose.voided && "line-through",
            )}
          >
            {who}
          </p>
        </>
      )}
      {dose.notes && (
        <p
          className={clsx(
            "text-xs text-muted-foreground whitespace-pre-wrap",
            dose.voided && "line-through",
          )}
        >
          {dose.notes}
        </p>
      )}
      {dose.voided && (
        <p className="text-xs">
          Voided by {dose.voidedBy ?? "someone"}: {dose.voidReason}
        </p>
      )}
    </div>
  );
}

/** A slot with no live dose: missed once its window has ended, else due. */
export function OpenSlotText({ slot }: { slot: SlotView }) {
  if (slot.slot === null)
    return <p className="text-muted-foreground">None given</p>;
  if (slot.state === "MISSED")
    return <p className="font-medium text-destructive">Missed</p>;
  if (slot.state === "DUE") return <p className="text-muted-foreground">Due</p>;
  return (
    <p className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">Not due</span>
    </p>
  );
}

interface CellProps {
  slot: SlotView;
  /** Null for a viewer who may only read. */
  controls: DoseControls | null;
  /** False where the page shows this slot's controls elsewhere: here it is
   * read only. */
  withControls?: boolean;
  /** Shows the slot's name in the cell: always on a phone, and where no
   * column heads it. */
  showSlotName?: boolean;
}

/**
 * One slot of an order on one day, or an as-needed order's day: what was
 * recorded, or missed or due, and the controls the viewer has. A cell with
 * controls takes focus (by id) when they go.
 */
export function DoseSlotCell({
  slot,
  controls,
  withControls = true,
  showSlotName,
}: CellProps) {
  const live = withControls ? controls : null;
  const canGive = !!live?.canAdminister && live.inCare && slot.recordable;
  const name = slot.slot === null ? "As needed" : DOSE_SLOT_LABELS[slot.slot];
  return (
    <li
      id={withControls ? doseCellId(slot) : undefined}
      tabIndex={withControls ? -1 : undefined}
      aria-label={slot.label}
      className="min-w-0 rounded-md border p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={clsx(
              "text-xs font-medium text-muted-foreground",
              !showSlotName && "@[600px]/sheet:sr-only",
            )}
          >
            {name}
          </p>
          {slot.doses.length > 0 ? (
            slot.doses.map((dose) => (
              <div
                key={dose.id}
                className="flex items-start justify-between gap-1"
              >
                <DoseLine dose={dose} />
                {live?.canManage && (
                  <VoidDoseButton
                    dose={dose}
                    label={slot.label}
                    fallbackId={doseCellId(slot)}
                  />
                )}
              </div>
            ))
          ) : (
            <OpenSlotText slot={slot} />
          )}
          {slot.voidedDoses.map((dose) => (
            <DoseLine key={dose.id} dose={dose} />
          ))}
        </div>
      </div>
      {canGive && live && (
        <div className="mt-2">
          <DoseSlotActions
            slot={slot}
            controls={live}
            fallbackId={doseCellId(slot)}
          />
        </div>
      )}
    </li>
  );
}

/** A day as a list heading reads it. */
const dayName = (day: CalendarDay, today: CalendarDay) =>
  day === today ? `Today, ${formatShelterDay(day)}` : formatShelterDay(day);

interface DaysProps {
  days: (DayView | RunDayView)[];
  controls: DoseControls | null;
  today: CalendarDay;
}

/**
 * An order's days, newest first, each a row of its slots: days by slots on a
 * wide screen, a list per day on a phone. A day of a run that the page shows
 * with its controls elsewhere is read only here.
 */
export function DoseDays({ days, controls, today }: DaysProps) {
  const slots = days[0]?.slots ?? [];
  const grid =
    "grid gap-2 @[600px]/sheet:grid-cols-[10rem_repeat(var(--slots),minmax(0,1fr))] @[600px]/sheet:items-start";
  return (
    <div
      className="@container/sheet"
      style={{ "--slots": slots.length } as CSSProperties}
    >
      {/* The slots' names over their columns, on a wide screen. Each cell
          names its slot for a screen reader. */}
      {slots.some((slot) => slot.slot !== null) && (
        <div
          aria-hidden
          className={clsx(grid, "mb-1 hidden @[600px]/sheet:grid")}
        >
          <span />
          {slots.map((slot) => (
            <span
              key={slot.key}
              className="text-xs font-medium text-muted-foreground"
            >
              {slot.slot ? DOSE_SLOT_LABELS[slot.slot] : ""}
            </span>
          ))}
        </div>
      )}
      <ol className="space-y-2">
        {days.map((day) => {
          const withControls = !("elsewhere" in day && day.elsewhere);
          return (
            <li key={day.day} className="space-y-1">
              <div className={grid}>
                <p className="text-sm font-medium">{dayName(day.day, today)}</p>
                <ul className="contents" aria-label={dayName(day.day, today)}>
                  {day.slots.map((slot) => (
                    <DoseSlotCell
                      key={slot.key}
                      slot={slot}
                      controls={controls}
                      withControls={withControls}
                    />
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
