import Link from "next/link";
import type { ReactNode } from "react";
import type { FosterMedical as FosterMedicalData } from "@/app/lib/data/fosters/foster-medical";
import { recordFosterDose } from "@/app/lib/actions/foster-care.actions";
import { MEDICAL_DOCUMENT_TYPE_LABELS, TEST_RESULT_LABELS } from "@/app/lib/constants/medical";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { documentFileHref } from "@/app/lib/utils/medical-document-file";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DoseDays } from "../animals/medical/dose-sheet";
import { FosterTreatmentButton } from "./foster-treatment-form";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <Card role="region" aria-labelledby={id}>
    <CardHeader><CardTitle id={id} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-ring">{title}</CardTitle></CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>;
}

const Contact = () => <p className="text-xs text-muted-foreground">Questions? Contact the shelter.</p>;

export function FosterMedical({ data, canCare }: { data: FosterMedicalData; canCare: boolean }) {
  const controls = { canAdminister: canCare, canManage: false, inCare: true, today: data.today, time: data.time, recordDoseAction: recordFosterDose };
  return <div className="flex min-w-0 flex-col gap-4 break-words md:gap-6">
    <Link href="/dashboard/my-foster-animals" className="text-sm text-muted-foreground hover:underline">← My foster animals</Link>
    <h1 className="text-2xl font-semibold">Medical care for {data.animalName}</h1>
    <Section id="foster-alerts" title="Alerts">
      {data.alerts.length ? <ul className="space-y-3">{data.alerts.map((alert) => <li key={alert.id}>
        <p className="font-medium">{alert.type === "ALLERGY" ? "Allergy: " : ""}{alert.name}</p>
        {alert.notes && <p className="whitespace-pre-wrap text-sm">{alert.notes}</p>}
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No allergies or active conditions on record.</p>}
      <Contact />
    </Section>
    <Section id="foster-care-due" title="Care due">
      {data.due.length ? <ul className="space-y-4">{data.due.map((entry) => <li key={entry.id} className="space-y-2">
        <p className="font-medium">{entry.name} · Due {formatShelterDayOrNA(entry.dueDate)}</p>
        {entry.notes && <p className="whitespace-pre-wrap text-sm">{entry.notes}</p>}
        {entry.recordable && canCare ? <FosterTreatmentButton entryId={entry.id} name={entry.name} notes={entry.notes} today={data.today} placementStart={data.placementStart} /> : <p className="text-sm text-muted-foreground">The shelter will arrange this.</p>}
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No scheduled care.</p>}
      <Contact />
    </Section>
    <Section id="foster-medications" title="Medications">
      {data.orders.length ? <ul className="space-y-6">{data.orders.map((order) => <li key={order.id} className="min-w-0 space-y-3">
        <h2 className="font-medium">{order.line}</h2>
        {order.instructions && <p className="whitespace-pre-wrap text-sm">{order.instructions}</p>}
        <DoseDays days={order.days} controls={controls} today={data.today} />
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No active medication orders.</p>}
      <Contact />
    </Section>
    <Section id="foster-vaccines-tests" title="Vaccines and tests given">
      {data.given.length ? <ul className="space-y-3">{data.given.map((entry) => <li key={entry.id} className="text-sm">
        <p className="font-medium">{entry.name} · {entry.completedDate ? formatShelterDayOrNA(entry.completedDate) : "Date unknown"} · {entry.source}</p>
        {entry.results.map((result) => <p key={result.analyteName}>{result.analyteName}: {TEST_RESULT_LABELS[result.result]}</p>)}
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No vaccines or tests given on record.</p>}
      <Contact />
    </Section>
    <Section id="foster-documents" title="Documents">
      {data.documents.length ? <ul className="space-y-3">{data.documents.map((document) => <li key={document.id} className="min-w-0 text-sm">
        {document.fileHeld ? <a href={documentFileHref(document.id)} target="_blank" rel="noopener noreferrer" className="break-all font-medium underline">{document.name}</a> : <span>{document.name} · File unavailable</span>}
        <p className="text-muted-foreground">{MEDICAL_DOCUMENT_TYPE_LABELS[document.type]}{document.documentDate && ` · ${formatShelterDayOrNA(document.documentDate)}`}</p>
        {document.notes && <p className="whitespace-pre-wrap">{document.notes}</p>}
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No documents on record.</p>}
      <Contact />
    </Section>
  </div>;
}
