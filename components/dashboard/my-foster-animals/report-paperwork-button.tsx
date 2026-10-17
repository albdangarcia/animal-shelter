"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";
import { MedicalDocumentForm, type DocumentFormHandle } from "../animals/medical/medical-document-form";
import { DiscardChangesDialog } from "../animals/medical/discard-changes-dialog";
import type { DocumentFormChoices } from "@/app/lib/data/animals/medical-document.data";

export function ReportPaperworkButton({ animalId, reportId, choices }: { animalId: string; reportId: string; choices: DocumentFormChoices }) {
  const [open, setOpen] = useState(false);
  const form = useRef<DocumentFormHandle>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const guard = useConfirmedOpenChange(() => form.current?.isDirty() ?? false, setOpen);
  return <>
    <Button ref={trigger} size="sm" variant="outline" onClick={() => setOpen(true)}>Add paperwork</Button>
    <Dialog open={open} onOpenChange={(next) => !form.current?.isPending() && guard.guardedOnOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" onCloseAutoFocus={(event) => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); else document.getElementById("foster-reports")?.focus(); }}>
        <DialogHeader><DialogTitle>Add paperwork</DialogTitle><DialogDescription>Upload one file for this visit. You can add another afterwards.</DialogDescription></DialogHeader>
        {open && <MedicalDocumentForm mode={{ upload: { animalId, vetReportId: reportId } }} choices={choices} onFormSubmit={() => setOpen(false)} ref={form} />}
      </DialogContent>
    </Dialog>
    <DiscardChangesDialog open={guard.isConfirmOpen} onConfirm={guard.confirmDiscard} onCancel={guard.cancelDiscard} subject="document" />
  </>;
}
