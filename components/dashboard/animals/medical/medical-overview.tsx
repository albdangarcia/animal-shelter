import Link from "next/link";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MedicalOverview as MedicalOverviewData } from "@/app/lib/data/animals/medical-entry.data";
import type { RabiesStatus } from "@/app/lib/utils/medical-days";
import type { SpayNeuterStatus } from "@/app/lib/utils/spay-neuter";
import {
  SPAY_NEUTER_EXEMPTION_REASON_LABELS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";
import { formatShelterDay } from "@/app/lib/utils/shelter-day";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import { formatWeight } from "@/app/lib/utils/weight-format";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import { MedicalEntryList } from "./medical-entry-list";
import { AddMedicalEntryMenu } from "./add-medical-entry-menu";
import { DUE_HEADING_ID } from "./use-entry-dialog-focus";

const rabiesText = (rabies: RabiesStatus) => {
  switch (rabies.status) {
    case "VALID":
      return `Valid until ${formatShelterDay(rabies.validUntilDate)}`;
    case "EXPIRED":
      return `Expired ${formatShelterDay(rabies.validUntilDate)}`;
    case "DATE_UNKNOWN":
      return "On record, date given unknown";
    case "NONE":
      return "None on record";
  }
};

// "Altered (spay, Oct 3, 2026)", "Exempt until Nov 3, 2026: too young or
// underweight", "Intact (exam Oct 3, 2026)", "Not on record".
const spayNeuterText = (status: SpayNeuterStatus) => {
  switch (status.status) {
    case "ALTERED":
      return `Altered (${SURGERY_PROCEDURE_LABELS[status.procedure].toLowerCase()}, ${
        status.completedDate ? formatShelterDay(status.completedDate) : "date unknown"
      })`;
    case "EXEMPT": {
      const reason = SPAY_NEUTER_EXEMPTION_REASON_LABELS[status.reason].toLowerCase();
      return status.reviewDate
        ? `Exempt until ${formatShelterDay(status.reviewDate)}: ${reason}`
        : `Exempt: ${reason}`;
    }
    case "INTACT":
      return `Intact (exam ${formatShelterDay(status.examDate)})`;
    case "UNKNOWN":
      return "Not on record";
  }
};

/**
 * The due rows in the order they fall due: scheduled care by its due day, and
 * the exemption open for review by its review day.
 */
const dueRows = (overview: MedicalOverviewData) => {
  const { dueEntries, reviewEntry } = overview;
  if (!reviewEntry) return dueEntries;
  const reviewDay = reviewEntry.reviewDate ?? "";
  const at = dueEntries.findIndex((entry) => (entry.dueDate ?? "") > reviewDay);
  return at === -1
    ? [...dueEntries, reviewEntry]
    : [...dueEntries.slice(0, at), reviewEntry, ...dueEntries.slice(at)];
};

interface Props {
  animalId: string;
  overview: MedicalOverviewData;
  unitSystem: WeightUnitSystem;
  controls: MedicalControls | null;
}

const MedicalOverview = ({ animalId, overview, unitSystem, controls }: Props) => {
  const base = `/dashboard/animals/${animalId}/medical`;
  const {
    rabies,
    spayNeuter,
    chips,
    currentWeightGrams,
    reviewEntry,
    recentEntries,
    names,
    today,
  } = overview;
  const due = dueRows(overview);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Medical</CardTitle>
        <CardDescription>
          Vaccines, tests, treatments, surgeries and microchips: what is due,
          and what this animal has been given.
        </CardDescription>
        {controls?.canManage && (
          <CardAction>
            <AddMedicalEntryMenu
              animalId={controls.animalId}
              options={controls.options}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <dl
          aria-label="Medical status"
          className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2"
        >
          <div>
            <dt className="text-xs text-muted-foreground">Rabies</dt>
            <dd
              className={
                rabies.status === "EXPIRED"
                  ? "text-sm font-medium text-destructive"
                  : "text-sm font-medium"
              }
            >
              {rabiesText(rabies)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Spay/neuter</dt>
            <dd
              className={
                spayNeuter.status === "UNKNOWN" || spayNeuter.status === "INTACT"
                  ? "text-sm font-medium text-destructive"
                  : "text-sm font-medium"
              }
            >
              {spayNeuterText(spayNeuter)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Microchip</dt>
            <dd className="text-sm font-medium">
              {chips.length > 0 ? (
                <ul>
                  {chips.map((chip) => (
                    <li key={chip.entryId} className="font-mono">
                      {chip.chipNumber}
                    </li>
                  ))}
                </ul>
              ) : (
                "None on record"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Current weight</dt>
            <dd className="text-sm font-medium">
              {currentWeightGrams !== null
                ? formatWeight(currentWeightGrams, unitSystem)
                : "Not recorded"}{" "}
              <Link
                href={`${base}/vitals`}
                className="text-muted-foreground font-normal underline underline-offset-4"
              >
                Vitals
              </Link>
            </dd>
          </div>
        </dl>

        <section aria-labelledby={DUE_HEADING_ID} className="space-y-3">
          {/* Takes focus when a declined row leaves the list and there is no
              Add entry button to send it to. */}
          <h3 id={DUE_HEADING_ID} tabIndex={-1} className="font-medium">
            Due
          </h3>
          {due.length > 0 ? (
            <MedicalEntryList
              entries={due}
              names={names}
              today={today}
              controls={controls}
              due
              reviewId={reviewEntry?.id}
            />
          ) : (
            <p className="rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              Nothing scheduled.
            </p>
          )}
        </section>

        <section aria-labelledby="recent-medical-entries" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 id="recent-medical-entries" className="font-medium">
              Recent entries
            </h3>
            <Link
              href={`${base}/history`}
              className="text-sm underline underline-offset-4"
            >
              View all
            </Link>
          </div>
          {recentEntries.length > 0 ? (
            <MedicalEntryList
              entries={recentEntries}
              names={names}
              today={today}
              controls={controls}
            />
          ) : (
            <p className="rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
              Nothing recorded yet.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
};

export default MedicalOverview;
