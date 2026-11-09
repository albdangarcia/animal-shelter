"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { DayField } from "@/components/forms/day-field";
import { submitVetVisitReport } from "@/app/lib/actions/vet-visit-report.actions";
import { VetVisitReportSchema, type VetVisitReportFormInput } from "@/app/lib/zod-schemas/vet-visit-report.schemas";
import type { FosterMedical } from "@/app/lib/data/fosters/foster-medical";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { haveFormValuesChanged, useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";
import { DiscardChangesDialog } from "../animals/medical/discard-changes-dialog";
import { MedicalTextField, MedicalTextareaField, OptionalSelectField } from "../animals/medical/medical-form-fields";

export function VetVisitReportButton({ data }: { data: Pick<FosterMedical, "animalId" | "today" | "placementStart" | "vetClinics"> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const initial = useRef<VetVisitReportFormInput>({ visitDate: data.today, vetPartnerId: null, vetName: "", summary: "" });
  const form = useForm<VetVisitReportFormInput>({ resolver: standardSchemaResolver(VetVisitReportSchema) as Resolver<VetVisitReportFormInput>, defaultValues: { visitDate: data.today, vetPartnerId: null, vetName: "", summary: "" } });
  const guard = useConfirmedOpenChange(() => haveFormValuesChanged(form.getValues(), initial.current), setOpen);
  const submit = (values: VetVisitReportFormInput) => startTransition(async () => {
    const result = await submitVetVisitReport(data.animalId, values);
    if (result.ok) {
      toast.success(result.message);
      setOpen(false);
    } else {
      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
      if (!result.fieldErrors) router.refresh();
    }
  });
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <Button ref={trigger} size="sm" onClick={() => { initial.current = { visitDate: data.today, vetPartnerId: null, vetName: "", summary: "" }; form.reset(initial.current); setOpen(true); }}>Report outside vet visit</Button>
    <Dialog open={open} onOpenChange={(next) => !pending && guard.guardedOnOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" onCloseAutoFocus={(event) => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); else document.getElementById("foster-reports")?.focus(); }}>
        <DialogHeader className="min-w-0"><DialogTitle className="break-words">Report outside vet visit</DialogTitle><DialogDescription>Tell the shelter what happened. Add paperwork after sending the report. The shelter will review it before recording care.</DialogDescription></DialogHeader>
        <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-6">
          <fieldset disabled={pending} className="m-0 min-w-0 space-y-6 border-0 p-0">
            <DayField control={form.control} name="visitDate" label="Visit date" required triggerClassName="w-full" disabledDates={(date) => { const day = format(date, "yyyy-MM-dd"); return day < data.placementStart || day > data.today; }} />
            <OptionalSelectField control={form.control} name="vetPartnerId" label="Clinic" noneLabel="A different vet" options={data.vetClinics.map((clinic) => ({ value: clinic.id, label: clinic.name }))} disabled={pending} />
            <MedicalTextField control={form.control} name="vetName" label="Vet's name" />
            <MedicalTextareaField control={form.control} name="summary" label="What happened" />
          </fieldset>
          <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => guard.guardedOnOpenChange(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send report"}</Button></DialogFooter>
        </form></Form>
      </DialogContent>
    </Dialog>
    <DiscardChangesDialog open={guard.isConfirmOpen} onConfirm={guard.confirmDiscard} onCancel={guard.cancelDiscard} subject="report" />
  </>;
}
