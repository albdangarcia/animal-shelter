import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import { TimeAgo } from "@/components/common/time-ago";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import { MedicalEntryStatus } from "@/prisma/generated/enums";
import {
  MEDICAL_ENTRY_SOURCE_LABELS,
  MEDICAL_ENTRY_KIND_LABELS,
  MEDICAL_ROUTE_LABELS,
  SPAY_NEUTER_EXEMPTION_REASON_LABELS,
  SURGERY_EVIDENCE_LABELS,
  TEST_RESULT_LABELS,
  formatDose,
} from "@/app/lib/constants/medical";
import {
  formatShelterDayOrNA,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import {
  medicalEntryName,
  type NameableMedicalEntry,
} from "@/app/lib/utils/medical-entry-name";

type EntryDay = Pick<MedicalEntryDisplay, "status" | "completedDate" | "dueDate"> &
  Partial<Pick<MedicalEntryDisplay, "exemptionReason" | "reviewDate">>;

/** A declined spay or neuter: an exemption, with its reason. */
export const isExemption = (entry: EntryDay) =>
  entry.status === MedicalEntryStatus.DECLINED && !!entry.exemptionReason;

/**
 * The day an entry is about, as it reads on a page: the day it was given, or
 * for care not given, the day it was due. Only given care can have an unknown
 * day. An exemption is about the day it is to be reviewed, if it has one: it
 * may never have been due.
 */
export const entryDayText = (entry: EntryDay) => {
  if (isExemption(entry)) {
    return entry.reviewDate
      ? `Review on ${formatShelterDayOrNA(entry.reviewDate)}`
      : "No review date";
  }
  if (entry.status !== MedicalEntryStatus.COMPLETED) {
    return `Due ${formatShelterDayOrNA(entry.dueDate)}`;
  }
  return entry.completedDate
    ? formatShelterDayOrNA(entry.completedDate)
    : "Date unknown";
};

type TitledEntry = NameableMedicalEntry &
  Partial<Pick<MedicalEntryDisplay, "chipNumber">>;

/** An entry's name, with a chip's number: "Microchip 985141000100003". */
const entryTitle = (entry: TitledEntry) =>
  entry.chipNumber
    ? `${medicalEntryName(entry)} ${entry.chipNumber}`
    : medicalEntryName(entry);

/** An entry named for a heading or a button: "DHPP (Due Oct 14, 2026)". */
export const entryLabel = (entry: EntryDay & TitledEntry) =>
  `${entryTitle(entry)} (${entryDayText(entry)})`;

/** Whether a day something is due on has passed or is today. */
const dueOn = (
  day: string | null,
  today: CalendarDay,
): "OVERDUE" | "DUE_TODAY" | null => {
  if (!day) return null;
  if (day < today) return "OVERDUE";
  return day === today ? "DUE_TODAY" : null;
};

/**
 * Whether scheduled care is late or due today, against the shelter's today.
 * Null for anything else, including voided care, which counts for nothing.
 */
export const dueState = (
  entry: Pick<MedicalEntryDisplay, "status" | "dueDate" | "voidedAt">,
  today: CalendarDay,
): "OVERDUE" | "DUE_TODAY" | null => {
  if (entry.status !== MedicalEntryStatus.SCHEDULED || entry.voidedAt) return null;
  return dueOn(entry.dueDate, today);
};

/** Who gave the care: the shelter (and who), or the outside vet. */
const sourceText = (entry: MedicalEntryDisplay) =>
  [
    entry.source && MEDICAL_ENTRY_SOURCE_LABELS[entry.source],
    entry.vetPartner?.name,
    entry.vetName,
    entry.administeredBy ? `by ${entry.administeredBy.name}` : null,
    // Given care that was planned first keeps the day it was due, and so
    // does an exemption declined from a scheduled spay or neuter.
    entry.status === MedicalEntryStatus.COMPLETED && entry.dueDate
      ? `due ${formatShelterDayOrNA(entry.dueDate)}`
      : null,
    isExemption(entry) && entry.dueDate
      ? `was due ${formatShelterDayOrNA(entry.dueDate)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** The kind's own fields, as "Label: value" pairs, leaving out the empty ones. */
const detailPairs = (entry: MedicalEntryDisplay): [string, string][] => {
  const pairs: [string, string | null | undefined][] = [];
  if (entry.vaccine) {
    const v = entry.vaccine;
    pairs.push(
      ["Manufacturer", v.manufacturer],
      ["Lot", v.lotNumber],
      ["Lot expiry", v.lotExpiryDate && formatShelterDayOrNA(v.lotExpiryDate)],
      ["Route", v.route && MEDICAL_ROUTE_LABELS[v.route]],
      ["Site", v.site],
      ["Rabies tag", v.rabiesTagNumber],
      ["Duration", v.durationMonths ? `${v.durationMonths} months` : null],
      [
        "Valid until",
        v.durationMonths
          ? v.validUntilDate
            ? formatShelterDayOrNA(v.validUntilDate)
            : "Unknown (date given unknown)"
          : null,
      ],
    );
  }
  if (entry.test) {
    pairs.push(
      ["Lot", entry.test.lotNumber],
      [
        "Lot expiry",
        entry.test.lotExpiryDate && formatShelterDayOrNA(entry.test.lotExpiryDate),
      ],
    );
  }
  if (entry.treatment) {
    const t = entry.treatment;
    pairs.push(
      [
        "Dose",
        t.doseAmount !== null && t.doseUnit
          ? formatDose(t.doseAmount, t.doseUnit)
          : null,
      ],
      ["Route", t.route && MEDICAL_ROUTE_LABELS[t.route]],
    );
  }
  if (entry.surgery) {
    const s = entry.surgery;
    pairs.push(
      ["Surgeon", s.surgeon],
      ["Evidence", s.evidence && SURGERY_EVIDENCE_LABELS[s.evidence]],
    );
  }
  if (entry.microchip) {
    pairs.push(["Brand", entry.microchip.brand]);
  }
  return pairs.filter((pair): pair is [string, string] => !!pair[1]);
};

const RESULT_VARIANT = {
  POSITIVE: "destructive",
  NEGATIVE: "secondary",
  INCONCLUSIVE: "outline",
  INVALID: "outline",
} as const;

interface Props {
  entry: MedicalEntryDisplay;
  /** The shelter's today, for marking scheduled care overdue or due today. */
  today: CalendarDay;
  /** Shown top right: the row's actions, when the viewer may use them. */
  actions?: ReactNode;
  /** Shown under the entry: its change history. */
  footer?: ReactNode;
  /**
   * The entry is an exemption listed on the due list for review: it is due
   * on its review day.
   */
  review?: boolean;
}

export function MedicalEntryItem({
  entry,
  today,
  actions,
  footer,
  review = false,
}: Props) {
  const voided = !!entry.voidedAt;
  const exemption = isExemption(entry);
  const declined = entry.status === MedicalEntryStatus.DECLINED && !exemption;
  // An exemption holds on its review day and lapses the day after.
  const lapsed = exemption && !!entry.reviewDate && entry.reviewDate < today;
  // On the due list, an exemption open for review is due on its review day.
  const due =
    review && !voided ? dueOn(entry.reviewDate, today) : dueState(entry, today);
  const details = detailPairs(entry);
  const source = sourceText(entry);
  const name = medicalEntryName(entry);
  const surgery = entry.surgery;

  return (
    <li
      className="border rounded-lg p-4"
      aria-label={`${entryTitle(entry)}, ${entryDayText(entry)}${voided ? ", voided" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={clsx("min-w-0 flex-1", voided && "text-muted-foreground")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={clsx("text-sm font-semibold", voided && "line-through")}>
              {name}
              {entry.chipNumber && (
                <span className="ml-2 font-mono font-medium">{entry.chipNumber}</span>
              )}
            </span>
            <Badge variant="outline">{MEDICAL_ENTRY_KIND_LABELS[entry.kind]}</Badge>
            {voided && <Badge variant="destructive">Voided</Badge>}
            {due === "OVERDUE" && <Badge variant="destructive">Overdue</Badge>}
            {due === "DUE_TODAY" && <Badge>Due today</Badge>}
            {declined && <Badge variant="outline">Declined</Badge>}
            {exemption && (
              <Badge variant="outline">{lapsed ? "Exemption lapsed" : "Exempt"}</Badge>
            )}
            <span
              className={clsx(
                "text-sm text-muted-foreground",
                voided && "line-through",
              )}
            >
              {entryDayText(entry)}
            </span>
          </div>

          <div className={clsx(voided && "line-through")}>
            {source && (
              <p className="mt-1 text-sm text-muted-foreground">{source}</p>
            )}

            {declined && (
              <p className="mt-1 text-sm">Reason declined: {entry.declineReason}</p>
            )}

            {exemption && entry.exemptionReason && (
              <p className="mt-1 text-sm">
                Reason for the exemption:{" "}
                {SPAY_NEUTER_EXEMPTION_REASON_LABELS[entry.exemptionReason]}
                {entry.declineReason && <>. {entry.declineReason}</>}
              </p>
            )}

            {details.length > 0 && (
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt className="inline text-xs text-muted-foreground">
                      {label}:{" "}
                    </dt>
                    <dd className="inline font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {surgery?.findings && (
              <p className="mt-2 text-sm whitespace-pre-wrap">
                <span className="text-xs text-muted-foreground">Findings: </span>
                {surgery.findings}
              </p>
            )}
            {surgery?.anesthesiaNotes && (
              <p className="mt-1 text-sm whitespace-pre-wrap">
                <span className="text-xs text-muted-foreground">
                  Anesthesia notes:{" "}
                </span>
                {surgery.anesthesiaNotes}
              </p>
            )}

            {entry.test && entry.test.results.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Results">
                {entry.test.results.map((row) => (
                  <li key={row.analyteId}>
                    <Badge variant={RESULT_VARIANT[row.result]}>
                      {row.analyteName}: {TEST_RESULT_LABELS[row.result]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            {entry.notes && (
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {entry.notes}
              </p>
            )}
          </div>

          {voided && (
            <p className="mt-2 text-sm">
              Voided by {entry.voidedBy?.name ?? "someone"}{" "}
              <TimeAgo date={entry.voidedAt} />: {entry.voidReason}
            </p>
          )}
        </div>
        {actions}
      </div>
      {footer}
    </li>
  );
}
