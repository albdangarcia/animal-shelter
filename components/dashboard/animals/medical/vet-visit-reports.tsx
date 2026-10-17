"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { VetVisitReportDisplay } from "@/app/lib/data/vet-visit-reports";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import { MEDICAL_ENTRY_KIND_LABELS } from "@/app/lib/constants/medical";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { documentFileHref } from "@/app/lib/utils/medical-document-file";
import { medicalEntryName } from "@/app/lib/utils/medical-entry-name";
import { reviewVetVisitReport, dismissVetVisitReport } from "@/app/lib/actions/vet-visit-report.actions";
import { useConfirmedOpenChange, type DirtyFormHandle } from "@/hooks/use-confirmed-open-change";
import { CareEntryForm } from "./care-entry-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { VoidReasonDialog } from "./void-reason-dialog";

const KINDS = [MedicalEntryKind.VACCINE, MedicalEntryKind.TEST, MedicalEntryKind.TREATMENT, MedicalEntryKind.SURGERY, MedicalEntryKind.EXAM, MedicalEntryKind.MICROCHIP];

function ReportControls({ report, options, scheduled }: { report: VetVisitReportDisplay; options: MedicalEntryFormOptions; scheduled: MedicalEntryDisplay[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selection, setSelection] = useState<{ kind: MedicalEntryKind; scheduled?: MedicalEntryDisplay } | null>(null);
  const form = useRef<DirtyFormHandle & { isPending?: () => boolean }>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const guard = useConfirmedOpenChange(() => form.current?.isDirty() ?? false, setOpen);
  const returnFocus = (event: Event) => {
    event.preventDefault();
    if (trigger.current?.isConnected) trigger.current.focus();
    else document.getElementById(`vet-report-${report.id}`)?.focus();
  };
  return <>
    <div className="flex flex-wrap gap-2">
      <Button ref={trigger} size="sm" variant="outline" disabled={pending} onClick={() => { setSelection(null); setOpen(true); }}>Record care…</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
        const result = await reviewVetVisitReport(report.id);
        if (result.ok) { toast.success(result.message); document.getElementById(`vet-report-${report.id}`)?.focus(); }
        else { toast.error(result.message); router.refresh(); }
      })}>{pending ? "Saving…" : "Mark reviewed"}</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setDismissOpen(true)}>Dismiss</Button>
    </div>
    <Dialog open={open} onOpenChange={(next) => !form.current?.isPending?.() && guard.guardedOnOpenChange(next)}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto" onCloseAutoFocus={returnFocus}>
        <DialogHeader className="min-w-0"><DialogTitle className="break-words">{selection ? `Record ${MEDICAL_ENTRY_KIND_LABELS[selection.kind].toLowerCase()} from report` : "Record care from report"}</DialogTitle><DialogDescription>Visit on {formatShelterDayOrNA(report.visitDate)}. Record what the paperwork supports, then mark the report reviewed when finished.</DialogDescription></DialogHeader>
        {open && (selection ? <CareEntryForm key={selection.scheduled?.id ?? selection.kind} animalId={report.animalId} kind={selection.kind} scheduled={selection.scheduled} report={{ id: report.id, visitDate: report.visitDate, vetPartnerId: report.vetPartnerId, vetName: report.vetName }} options={options} ref={form} onFormSubmit={() => setOpen(false)} /> : <div className="space-y-4">
          <div><p className="mb-2 text-sm font-medium">Record care already scheduled</p><div className="flex flex-col items-start gap-2">{scheduled.length ? scheduled.map((entry) => <Button key={entry.id} variant="outline" className="h-auto max-w-full whitespace-normal text-left break-words" onClick={() => setSelection({ kind: entry.kind, scheduled: entry })}>{medicalEntryName(entry)} · Due {formatShelterDayOrNA(entry.dueDate)}</Button>) : <p className="text-sm text-muted-foreground">No scheduled care.</p>}</div></div>
          <div><p className="mb-2 text-sm font-medium">Add an entry</p><div className="flex flex-wrap gap-2">{KINDS.map((kind) => <Button key={kind} variant="outline" onClick={() => setSelection({ kind })}>{MEDICAL_ENTRY_KIND_LABELS[kind]}</Button>)}</div></div>
        </div>)}
      </DialogContent>
    </Dialog>
    <DiscardChangesDialog open={guard.isConfirmOpen} onConfirm={guard.confirmDiscard} onCancel={guard.cancelDiscard} />
    {dismissOpen && <VoidReasonDialog open onOpenChange={setDismissOpen} title="Dismiss vet visit report?" description="The report and paperwork stay on the record. Say why no further review is needed." confirmLabel="Dismiss report" reasonLabel="Reason for dismissal" placeholder="Why is this being dismissed?" onVoid={(reason) => dismissVetVisitReport(report.id, reason)} onCloseAutoFocus={(event) => {
      // The action can close the dialog before its response removes the
      // controls. The report row stays through both updates.
      event.preventDefault();
      document.getElementById(`vet-report-${report.id}`)?.focus();
    }} />}
  </>;
}

export function VetVisitReports({ reports, options, scheduled }: { reports: VetVisitReportDisplay[]; options: MedicalEntryFormOptions | null; scheduled: MedicalEntryDisplay[] }) {
  if (!reports.length) return null;
  return <Card role="region" aria-label="Foster reports" className="min-w-0 break-words">
    <CardHeader><CardTitle>Foster reports</CardTitle></CardHeader>
    <CardContent><ul className="space-y-6">{reports.map((report) => <li key={report.id} id={`vet-report-${report.id}`} tabIndex={-1} className="min-w-0 scroll-mt-20 space-y-3 rounded-lg border p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <h2 className="font-medium">Visit on {formatShelterDayOrNA(report.visitDate)} · {report.vetPartner?.name ?? report.vetName}</h2>
      <p className="text-sm text-muted-foreground">Reported by {report.reportedBy.name}</p>
      <p className="whitespace-pre-wrap text-sm">{report.summary}</p>
      <p className="text-sm">{report.dismissReason ? `Dismissed by ${report.reviewedBy?.name}: ${report.dismissReason}` : report.reviewedAt ? `Reviewed by ${report.reviewedBy?.name}` : "Waiting for review"}</p>
      {report.documents.length > 0 && <ul className="space-y-1 text-sm">{report.documents.map((document) => <li key={document.id}>{document.fileRemovedAt ? `${document.name} · File removed` : <a href={documentFileHref(document.id)} target="_blank" rel="noopener noreferrer" className="break-all underline">{document.name}</a>}</li>)}</ul>}
      {report.entries.length > 0 && <div className="text-sm"><p className="font-medium">Entries recorded from this report</p><ul>{report.entries.map((entry) => <li key={entry.id}><a href={`/dashboard/animals/${report.animalId}/medical/history?kind=${entry.kind}`} className="underline">{medicalEntryName(entry)} · {formatShelterDayOrNA(entry.completedDate)}{entry.voidedAt ? " (voided)" : ""}</a></li>)}</ul></div>}
      {!report.reviewedAt && options && <ReportControls report={report} options={options} scheduled={scheduled} />}
    </li>)}</ul></CardContent>
  </Card>;
}
