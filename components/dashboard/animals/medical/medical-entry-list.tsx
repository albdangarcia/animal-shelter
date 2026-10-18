import Link from "next/link";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import { MedicalEntryItem } from "./medical-entry-item";
import { MedicalEntryActions } from "./medical-entry-actions";
import { MedicalEntryChanges } from "./medical-entry-changes";
import { ScheduledEntryActions } from "./scheduled-entry-actions";
import { ExemptionReviewActions } from "./exemption-review-actions";
import { AddConditionButton } from "./add-condition-buttons";
import { rabiesCertificateEligibility } from "@/app/lib/utils/medical-output";
import { parseCalendarDay } from "@/app/lib/utils/shelter-day";
import {
  MedicalConditionType,
  MedicalEntryKind,
  MedicalEntryStatus,
  TestResult,
} from "@/prisma/generated/enums";

/**
 * What given care offers the problem list: a test with a positive result,
 * a condition named for that result; an exam, a condition found on it. Each
 * opens the condition form with the entry as its source and its day as the
 * onset. Null for anything else.
 */
const conditionOffer = (entry: MedicalEntryDisplay) => {
  if (entry.status !== MedicalEntryStatus.COMPLETED || entry.voidedAt) return null;
  const onset = { sourceEntryId: entry.id, onsetDate: entry.completedDate };
  if (entry.kind === MedicalEntryKind.EXAM) {
    return { label: "Add a condition found on this exam", add: onset };
  }
  const positive = entry.test?.results.find((row) => row.result === TestResult.POSITIVE);
  if (entry.kind === MedicalEntryKind.TEST && positive) {
    return {
      label: "Add to problem list",
      add: { ...onset, name: `${positive.analyteName} positive` },
    };
  }
  return null;
};

interface Props {
  entries: MedicalEntryDisplay[];
  names: Record<string, string>;
  /** The shelter's today, for marking scheduled care overdue or due today. */
  today: CalendarDay;
  /** The shelter's units, for an exam's vitals. */
  unitSystem: WeightUnitSystem;
  /** Null for a viewer who may only read. */
  controls: MedicalControls | null;
  /**
   * The rows are the due list: each also gets the buttons for what can be
   * done with care that is due, as the viewer may.
   */
  due?: boolean;
  /**
   * On the due list, the spay/neuter exemption open for review: it is due on
   * its review day. It isn't recorded, rescheduled or declined: the spay or
   * neuter is scheduled from it, or a new exemption recorded.
   */
  reviewId?: string | null;
  className?: string;
  certificates?: boolean;
}

type RowProps = Omit<Props, "entries" | "className"> & {
  entry: MedicalEntryDisplay;
};

/**
 * One entry with its change history, and the row actions menu when it isn't
 * voided and the viewer may manage it: Void, and Edit on given care only. On
 * the due list, scheduled care also gets Record, Reschedule and Decline, and
 * the exemption open for review gets its own two actions.
 */
export async function MedicalEntryRow({
  entry,
  names,
  today,
  unitSystem,
  controls,
  due = false,
  reviewId = null,
  certificates = false,
}: RowProps) {
  const offer = conditionOffer(entry);
  const canReadOutcome = entry.outcomeId && await hasPermission(AppPermissions.OUTCOMES_READ);
  const canCorrectOutcome = canReadOutcome && !entry.voidedAt && await hasPermission(AppPermissions.OUTCOMES_MANAGE) && await hasPermission(AppPermissions.MEDICAL_MANAGE);
  const certificate = certificates && entry.kind === "VACCINE" && entry.vaccine?.durationMonths != null
    && entry.status === "COMPLETED" && !entry.voidedAt && !entry.outcomeId
    ? rabiesCertificateEligibility({ ...entry, completedDate: parseCalendarDay(entry.completedDate),
      vaccine: { ...entry.vaccine, validUntilDate: parseCalendarDay(entry.vaccine.validUntilDate) },
    }, { animalId: entry.animalId, entryId: entry.id }, today) : null;
  return (
    <MedicalEntryItem
      entry={entry}
      today={today}
      unitSystem={unitSystem}
      review={due && entry.id === reviewId}
      actions={
        controls?.canManage && !entry.voidedAt && !entry.outcomeId ? (
          <MedicalEntryActions
            animalId={controls.animalId}
            entry={entry}
            options={controls.options}
          />
        ) : undefined
      }
      footer={
        <>
          {certificate && <div className="mt-3 text-sm space-y-1">
            {certificate.available ? <a className="underline" href={`/medical-outputs/animals/${entry.animalId}/rabies/${entry.id}`}>Print rabies certificate</a>
              : <><p>Certificate unavailable: {certificate.message}</p>
                {controls?.canManage && <p>Use Actions → Edit to correct this vaccination record.</p>}</>}
          </div>}
          {due &&
            controls?.canManage &&
            entry.id === reviewId &&
            entry.procedure &&
            entry.exemptionReason && (
              <ExemptionReviewActions
                animalId={controls.animalId}
                exemption={{
                  procedure: entry.procedure,
                  exemptionReason: entry.exemptionReason,
                }}
                options={controls.options}
              />
            )}
          {due && controls && entry.id !== reviewId && (
            <ScheduledEntryActions
              animalId={controls.animalId}
              entry={entry}
              options={controls.options}
              today={today}
              canManage={controls.canManage}
              canAdminister={controls.canAdminister}
            />
          )}
          {controls?.canManage && controls.conditionChoices && offer && (
            <div className="mt-3">
              <AddConditionButton
                animalId={controls.animalId}
                choices={controls.conditionChoices}
                today={controls.options.today}
                mode={{ add: { type: MedicalConditionType.CONDITION, ...offer.add } }}
                label={offer.label}
              />
            </div>
          )}
          {canReadOutcome && <p className="mt-2 text-sm"><Link className="underline" href={`/dashboard/outcomes/${entry.outcomeId}/edit`}>{canCorrectOutcome ? "Correct through outcome" : "View outcome"}</Link></p>}
          <MedicalEntryChanges events={entry.events} names={names} kind={entry.kind} />
        </>
      }
    />
  );
}

/** Entries, each a `MedicalEntryRow`. */
export function MedicalEntryList({ entries, className, ...rest }: Props) {
  return (
    <ul className={className ?? "space-y-3"}>
      {entries.map((entry) => (
        <MedicalEntryRow key={entry.id} entry={entry} {...rest} />
      ))}
    </ul>
  );
}
