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

interface Props {
  animalId: string;
  overview: MedicalOverviewData;
  unitSystem: WeightUnitSystem;
  controls: MedicalControls | null;
}

const MedicalOverview = ({ animalId, overview, unitSystem, controls }: Props) => {
  const base = `/dashboard/animals/${animalId}/medical`;
  const { rabies, currentWeightGrams, dueEntries, recentEntries, names, today } =
    overview;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Medical</CardTitle>
        <CardDescription>
          Vaccines, tests and treatments: what is due, and what this animal
          has been given.
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
          {dueEntries.length > 0 ? (
            <MedicalEntryList
              entries={dueEntries}
              names={names}
              today={today}
              controls={controls}
              due
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
              No vaccines, tests or treatments recorded yet.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
};

export default MedicalOverview;
