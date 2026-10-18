import type { ReactNode } from "react";
import type { CompletedMedicalOutput, MedicalHistoryOutput } from "@/app/lib/utils/medical-output";
import { MEDICAL_HISTORY_SCOPE_TEXT, MEDICAL_OUTPUT_COPY_TEXT, MEDICAL_HISTORY_EMPTY_TEXT as empty, medicalOutputDayText as day } from "@/app/lib/utils/medical-output";
import {
  CARE_EPISODE_TYPE_LABELS, DOSE_UNIT_LABELS, EXAM_FINDING_STATUS_LABELS, EXAM_RESULT_LABELS,
  EXAM_TYPE_LABELS, MEDICAL_CONDITION_STATUS_LABELS, MEDICAL_CONDITION_TYPE_LABELS,
  MEDICAL_DOCUMENT_TYPE_LABELS, MEDICAL_ROUTE_LABELS, MEDICATION_FREQUENCY_LABELS,
  SPAY_NEUTER_EXEMPTION_REASON_LABELS, SURGERY_EVIDENCE_LABELS, SURGERY_PROCEDURE_LABELS, TEST_RESULT_LABELS,
} from "@/app/lib/constants/medical";
import { examBodySystemLabel } from "@/app/lib/constants/exam";
import { MICROCHIP_REGISTRATION_LABELS } from "@/app/lib/utils/microchip-registration";
import { PrintButton } from "./print-button";
import { OutputIdentity } from "./identity";
import styles from "./history.module.css";

function Care({ care: c }: { care: CompletedMedicalOutput }) {
  switch (c.kind) {
    case "VACCINE": return <><strong>Vaccine: {c.product}</strong>
      <p>Manufacturer: {c.manufacturer ?? "Not recorded"} · Lot: {c.lotNumber ?? "Not recorded"} · Lot expiry: {day(c.lotExpiryDate)}</p>
      <p>Route: {c.route ? MEDICAL_ROUTE_LABELS[c.route] : "Not recorded"} · Site: {c.site ?? "Not recorded"}</p>
      {c.durationMonths !== null && <p>Rabies tag: {c.rabiesTagNumber ?? "Not recorded"} · Duration: {c.durationMonths} months · Valid until: {day(c.validUntilDate)}</p>}</>;
    case "TEST": return <><strong>Test: {c.product}</strong><p>{c.results.length ? c.results.map((r) => `${r.analyteName}: ${TEST_RESULT_LABELS[r.result]}`).join("; ") : "No analyte results recorded."}</p></>;
    case "TREATMENT": return <><strong>Treatment: {c.product}</strong><p>Dose: {c.doseAmount ?? "Not recorded"} {c.doseUnit ? DOSE_UNIT_LABELS[c.doseUnit] : ""} · Route: {c.route ? MEDICAL_ROUTE_LABELS[c.route] : "Not recorded"}</p></>;
    case "SURGERY": return <><strong>Surgery: {SURGERY_PROCEDURE_LABELS[c.procedure]}</strong><p>Evidence: {c.evidence ? SURGERY_EVIDENCE_LABELS[c.evidence] : "Not recorded"}</p></>;
    case "EXAM": return <><strong>{EXAM_TYPE_LABELS[c.examType]} exam: {EXAM_RESULT_LABELS[c.overallResult]}</strong><ul>{c.findings.map((f) => <li key={f.bodySystem}>{examBodySystemLabel(f.bodySystem)}: {EXAM_FINDING_STATUS_LABELS[f.status]}</li>)}</ul></>;
    case "MICROCHIP": return <><strong>Microchip: {c.chipNumber}</strong><p>Brand: {c.brand ?? "Not recorded"}</p></>;
  }
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title}><h2>{title}</h2>{children}</section>;
}
function CareTable({ records }: { records: CompletedMedicalOutput[] }) {
  return <table><thead><tr><th scope="col">Recorded day</th><th scope="col">Completed care</th></tr></thead><tbody>
    {records.map((c, i) => <tr key={i}><td>{day(c.completedDate)}</td><td><Care care={c} /><p className={styles.note}>{c.provenance}</p></td></tr>)}
  </tbody></table>;
}
export function MedicalHistoryHandout({ output: o }: { output: MedicalHistoryOutput }) {
  const altered = o.summary.altered;
  const rabies = o.summary.rabies;
  const known = o.completedCare.filter((c) => c.completedDate !== null);
  const unknown = o.completedCare.filter((c) => c.completedDate === null);
  return <main className={styles.sheet}>
    <nav aria-label="Print controls" className={styles.controls}>
      <PrintButton /><a href={`/dashboard/animals/${o.animal.id}/medical`}>Return to medical record</a>
    </nav>
    <header><h1>Medical history — {o.animal.name}</h1>
      <OutputIdentity animal={o.animal} generatedDate={o.generatedDate} generatedAt={o.generatedAt} />
      <p className={styles.note}>{MEDICAL_HISTORY_SCOPE_TEXT}</p><p className={styles.note}>{MEDICAL_OUTPUT_COPY_TEXT}</p>
    </header>
    <Section title="Current recorded summary">
      <p>Spay/neuter: {altered.status === "ALTERED" ? `Altered — ${SURGERY_PROCEDURE_LABELS[altered.procedure]}, ${day(altered.completedDate)}`
        : altered.status === "EXEMPT" ? `Exempt — ${SPAY_NEUTER_EXEMPTION_REASON_LABELS[altered.reason]}; ${altered.reviewDate ? `review ${day(altered.reviewDate)}` : "no review day recorded"}`
        : altered.status === "INTACT" ? `Intact — exam ${day(altered.examDate)}` : "Unknown"}</p>
      <p>Rabies: {rabies.status === "VALID" ? `Valid through ${day(rabies.validUntilDate)}` : rabies.status === "EXPIRED" ? `Expired ${day(rabies.validUntilDate)} as of the generated day`
        : rabies.status === "DATE_UNKNOWN" ? "On record; validity date unknown" : "No rabies vaccination record available"}</p>
      {o.summary.chips.length ? <ul>{o.summary.chips.map((c) => <li key={c.chipNumber}>Microchip {c.chipNumber} · Brand: {c.brand ?? "Not recorded"} · Recorded day: {day(c.completedDate)}<br />
        Registration: {MICROCHIP_REGISTRATION_LABELS[c.registrationStatus]}{c.registryName && ` · Registry: ${c.registryName}`}{c.registrationStatus === "REGISTERED" && ` · Registration day: ${day(c.registrationDate)}`}</li>)}</ul> : <p>{empty.chips}</p>}
    </Section>
    <Section title="Completed care">
      {!o.completedCare.length && <p>{empty.completedCare}</p>}
      {!!known.length && <CareTable records={known} />}
      {!!unknown.length && <><h3>Date unknown</h3><CareTable records={unknown} /></>}
    </Section>
    <Section title="Conditions and allergies">
      {o.conditions.length ? <ul>{o.conditions.map((c, i) => <li key={i}>{MEDICAL_CONDITION_TYPE_LABELS[c.type]}: <strong>{c.name}</strong> · {MEDICAL_CONDITION_STATUS_LABELS[c.status]} · Onset: {day(c.onsetDate)}{c.status === "RESOLVED" && ` · Resolved: ${day(c.resolvedDate)}`}</li>)}</ul> : <p>{empty.conditions}</p>}
    </Section>
    <Section title="Care episodes">
      {o.careEpisodes.length ? <ul>{o.careEpisodes.map((e, i) => <li key={i}>{CARE_EPISODE_TYPE_LABELS[e.type]} · Start: {day(e.startDate)} · {e.endDate ? `Ended: ${day(e.endDate)}` : "Open — no end day recorded"}</li>)}</ul> : <p>{empty.careEpisodes}</p>}
    </Section>
    <Section title="Medication orders">
      <p className={styles.note}>Orders describe recorded instructions; they do not establish which doses were given.</p>
      {o.medications.length ? <ul>{o.medications.map((m, i) => <li key={i}><strong>{m.product}</strong> · {{ ACTIVE: "Active", UPCOMING: "Upcoming", ENDED: "Ended", DISCONTINUED: "Discontinued" }[m.state]}<p>{m.doseAmount} {DOSE_UNIT_LABELS[m.doseUnit]} · {MEDICAL_ROUTE_LABELS[m.route]} · {MEDICATION_FREQUENCY_LABELS[m.frequency]}{m.intervalDays && ` (${m.intervalDays} days)`}{m.firstSlot && ` · First slot: ${m.firstSlot}`}</p>
        <p>Start: {day(m.startDate)} · {m.endDate ? `End: ${day(m.endDate)}` : "No end day recorded"}{m.discontinuedDate && ` · Discontinued: ${day(m.discontinuedDate)}`}</p>{m.instructions && <p>{m.instructions}</p>}</li>)}</ul> : <p>{empty.medications}</p>}
    </Section>
    <Section title="Recorded planned care">
      <p className={styles.note}>These are plans remaining in the record, including overdue care. They are not evidence of care given or new prescriptions after leaving the shelter.</p>
      {o.plannedCare.length ? <ul>{o.plannedCare.map((p, i) => <li key={i}>{p.name} · Due: {day(p.dueDate)}{p.overdue && " · Overdue as of the generated day"}</li>)}</ul> : <p>{empty.plannedCare}</p>}
    </Section>
    <Section title="Relevant documents">
      <p className={styles.note}>Document descriptions only. Ask shelter staff about available paperwork.</p>
      {o.documents.length ? <ul>{o.documents.map((d, i) => <li key={i}>{d.name} · {MEDICAL_DOCUMENT_TYPE_LABELS[d.type]} · {day(d.documentDate)}</li>)}</ul> : <p>{empty.documents}</p>}
    </Section>
  </main>;
}
