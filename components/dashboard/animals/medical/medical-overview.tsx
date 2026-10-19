import { MedicalRecordHeader } from "./medical-record-header";
import { MICROCHIP_REGISTRATION_LABELS } from "@/app/lib/utils/microchip-registration";
import { vetReportHref } from "@/app/lib/utils/vet-visit-report";
import Link from "next/link";
import { clsx } from "clsx";
import { AlertCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import type { MedicalOverview as MedicalOverviewData } from "@/app/lib/data/animals/medical-entry.data";
import type { RabiesStatus } from "@/app/lib/utils/medical-days";
import type { SpayNeuterStatus } from "@/app/lib/utils/spay-neuter";
import type { ExamFact } from "@/app/lib/utils/exams";
import { ExamResult } from "@/prisma/generated/enums";
import {
  EXAM_RESULT_LABELS,
  EXAM_TYPE_LABELS,
  MEDICAL_CONDITION_STATUS_LABELS,
  SPAY_NEUTER_EXEMPTION_REASON_LABELS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";
import { formatShelterDay, formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { openEpisodeText, type CareStatus } from "@/app/lib/utils/care-status";
import type { WeightUnitSystem } from "@/app/lib/utils/shelter-settings";
import { formatWeight } from "@/app/lib/utils/weight-format";
import type { MedicalControls } from "@/app/lib/data/medical-catalog.data";
import type { TodaysDoses } from "@/app/lib/data/animals/medication.data";
import { MedicalEntryList } from "./medical-entry-list";
import { DoseSlotCell, doseControlsOf } from "./dose-sheet";
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

// "Intake exam, Oct 3, 2026: no concerns", or "None on record".
const lastExamText = (exam: ExamFact | null) =>
  exam
    ? `${EXAM_TYPE_LABELS[exam.examType]}, ${formatShelterDay(exam.completedDate)}: ${EXAM_RESULT_LABELS[
        exam.overallResult
      ].toLowerCase()}`
    : "None on record";

/**
 * What anyone handling or treating the animal must not miss: its allergies,
 * the conditions it lives with, and the care episode it is under. Each links
 * to the Conditions page. Nothing is shown when there is none.
 */
function CareAlerts({ care, href }: { care: CareStatus; href: string }) {
  const alerts = [
    ...care.allergies.map((allergy) => ({
      key: allergy.id,
      text: `Allergy: ${allergy.name}`,
      destructive: true,
    })),
    ...care.conditions.map((condition) => ({
      key: condition.id,
      text: `${condition.name} (${MEDICAL_CONDITION_STATUS_LABELS[condition.status].toLowerCase()})`,
      destructive: false,
    })),
    ...(care.episode
      ? [{ key: care.episode.id, text: openEpisodeText(care.episode), destructive: true }]
      : []),
  ];
  if (alerts.length === 0) return null;
  return (
    <section aria-label="Alerts" className="rounded-lg border p-4">
      <ul className="space-y-1">
        {alerts.map((alert) => (
          <li
            key={alert.key}
            className={clsx(
              "flex items-start gap-2 text-sm font-medium",
              alert.destructive && "text-destructive",
            )}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <Link href={href} className="underline-offset-4 hover:underline">
              {alert.text}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

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

/**
 * Each order's slots today, with their state and Give, and an active
 * as-needed order's day. Shown only when an order expects a dose today or
 * one as needed is active.
 */
function TodaysDosesSection({
  doses,
  controls,
  href,
}: {
  doses: TodaysDoses;
  controls: MedicalControls | null;
  href: string;
}) {
  const doseControls = doseControlsOf(controls, doses.today, doses.time);
  return (
    <section aria-labelledby="todays-doses" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 id="todays-doses" className="font-medium">
          Today&apos;s doses
        </h3>
        <Link href={href} className="text-sm underline underline-offset-4">
          Medications
        </Link>
      </div>
      <ul className="space-y-3">
        {doses.rows.map(({ summary, slots }) => (
          <li key={summary.order.id} className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-semibold">{summary.line}</p>
            {summary.order.instructions && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {summary.order.instructions}
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-3">
              {slots.map((slot) => (
                <DoseSlotCell key={slot.key} slot={slot} controls={doseControls} showSlotName />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface Props {
  animalId: string;
  overview: MedicalOverviewData;
  /** Null when no order expects a dose today and none as needed is active. */
  todaysDoses: TodaysDoses | null;
  unitSystem: WeightUnitSystem;
  controls: MedicalControls | null;
}

const MedicalOverview = ({ animalId, overview, todaysDoses, unitSystem, controls }: Props) => {
  const base = `/dashboard/animals/${animalId}/medical`;
  const {
    rabies,
    spayNeuter,
    chips,
    lastExam,
    care,
    currentWeightGrams,
    reviewEntry,
    recentEntries,
    names,
    today,
  } = overview;
  const due = dueRows(overview);

  return (
    <Card className="@container/card">
      <MedicalRecordHeader
        section="overview"
        action={controls?.canManage ? (
          <AddMedicalEntryMenu
            animalId={controls.animalId}
            options={controls.options}
          />
        ) : undefined}
      />
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <a href={`/medical-outputs/animals/${animalId}/history`}>
              <Printer aria-hidden="true" />
              Print adopter medical history
            </a>
          </Button>
        </div>
        {overview.waitingReports.length > 0 && <section aria-label="Foster reports waiting for review" className="rounded-lg border p-4">
        <ul className="space-y-2">{overview.waitingReports.map((report) => <li key={report.id}><Link href={vetReportHref(animalId, report.id)} className="text-sm font-medium underline">Foster report waiting for review: visit on {formatShelterDayOrNA(report.visitDate)}</Link></li>)}</ul>
      </section>}
      <CareAlerts care={care} href={`${base}/conditions`} />

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
                    <li key={chip.entryId} className="break-words">
                      <span className="font-mono">{chip.chipNumber}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        Registration: {MICROCHIP_REGISTRATION_LABELS[chip.registrationStatus]}
                        {chip.registryName && ` · ${chip.registryName}`}
                        {chip.registrationStatus === "REGISTERED" && ` · ${chip.registrationDate ? formatShelterDayOrNA(chip.registrationDate) : "Date unknown"}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                "None on record"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last exam</dt>
            <dd
              className={
                lastExam?.overallResult === ExamResult.NEEDS_VET_REVIEW
                  ? "text-sm font-medium text-destructive"
                  : "text-sm font-medium"
              }
            >
              {lastExamText(lastExam)}
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
              unitSystem={unitSystem}
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

        {todaysDoses && (
          <TodaysDosesSection
            doses={todaysDoses}
            controls={controls}
            href={`${base}/medications`}
          />
        )}

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
              unitSystem={unitSystem}
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
