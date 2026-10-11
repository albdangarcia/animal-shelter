import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import { TimeAgo } from "@/components/common/time-ago";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import {
  MEDICAL_ENTRY_SOURCE_LABELS,
  MEDICAL_ITEM_KIND_LABELS,
  MEDICAL_ROUTE_LABELS,
  TEST_RESULT_LABELS,
  formatDose,
} from "@/app/lib/constants/medical";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";

/** The day an entry was given, as it reads on a page. */
export const entryDayText = (completedDate: string | null) =>
  completedDate ? formatShelterDayOrNA(completedDate) : "Date unknown";

/** Who gave the care: the shelter (and who), or the outside vet. */
const sourceText = (entry: MedicalEntryDisplay) =>
  [
    MEDICAL_ENTRY_SOURCE_LABELS[entry.source],
    entry.vetPartner?.name,
    entry.vetName,
    entry.administeredBy ? `by ${entry.administeredBy.name}` : null,
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
  /** Shown top right: the row's actions, when the viewer may use them. */
  actions?: ReactNode;
  /** Shown under the entry: its change history. */
  footer?: ReactNode;
}

export function MedicalEntryItem({ entry, actions, footer }: Props) {
  const voided = !!entry.voidedAt;
  const details = detailPairs(entry);

  return (
    <li
      className="border rounded-lg p-4"
      aria-label={`${entry.item.name}, ${entryDayText(entry.completedDate)}${voided ? ", voided" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={clsx("min-w-0 flex-1", voided && "text-muted-foreground")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={clsx("text-sm font-semibold", voided && "line-through")}>
              {entry.item.name}
            </span>
            <Badge variant="outline">{MEDICAL_ITEM_KIND_LABELS[entry.kind]}</Badge>
            {voided && <Badge variant="destructive">Voided</Badge>}
            <span
              className={clsx(
                "text-sm text-muted-foreground",
                voided && "line-through",
              )}
            >
              {entryDayText(entry.completedDate)}
            </span>
          </div>

          <div className={clsx(voided && "line-through")}>
            <p className="mt-1 text-sm text-muted-foreground">
              {sourceText(entry)}
            </p>

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
