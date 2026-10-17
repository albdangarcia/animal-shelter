"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DayField } from "@/components/forms/day-field";
import { recordFosterTreatment } from "@/app/lib/actions/foster-care.actions";
import { FosterTreatmentSchema, type FosterTreatmentInput } from "@/app/lib/zod-schemas/foster-care.schemas";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { haveFormValuesChanged, useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";
import { DiscardChangesDialog } from "../animals/medical/discard-changes-dialog";
import { useEntryDialogFocus } from "../animals/medical/use-entry-dialog-focus";

export function FosterTreatmentButton({ entryId, name, notes, today, placementStart }: {
  entryId: string; name: string; notes: string | null; today: CalendarDay; placementStart: CalendarDay;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { triggerRef, returnFocus } = useEntryDialogFocus("foster-care-due");
  const startingValues = { completedDate: today, notes: notes ?? "" };
  const initial = useRef(startingValues);
  const form = useForm<FosterTreatmentInput>({
    resolver: standardSchemaResolver(FosterTreatmentSchema) as Resolver<FosterTreatmentInput>,
    defaultValues: startingValues,
  });
  const guard = useConfirmedOpenChange(() => haveFormValuesChanged(form.getValues(), initial.current), setOpen);
  const submit = (values: FosterTreatmentInput) => startTransition(async () => {
    const result = await recordFosterTreatment(entryId, values);
    if (result.ok) {
      toast.success(result.message);
      setOpen(false);
      // The recorded row leaves the list in the action's response, which
      // can arrive before or after the dialog closes.
      document.getElementById("foster-care-due")?.focus();
      return;
    }
    applyFieldErrors(form, result.fieldErrors);
    toast.error(result.message);
    if (!result.fieldErrors) router.refresh();
  });
  return <>
    <Button ref={triggerRef} size="sm" variant="outline" onClick={() => {
      initial.current = startingValues;
      form.reset(initial.current);
      setOpen(true);
    }} aria-label={`Record ${name} as given`}>Record as given</Button>
    <Dialog open={open} onOpenChange={(next) => !pending && guard.guardedOnOpenChange(next)}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader className="min-w-0">
          <DialogTitle className="break-words">Record {name} as given</DialogTitle>
          <DialogDescription>When you gave the treatment the shelter scheduled. A repeating treatment will have its next dose planned automatically.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
            <fieldset disabled={pending} className="m-0 min-w-0 space-y-6 border-0 p-0">
              <DayField control={form.control} name="completedDate" label="Date given" required triggerClassName="w-full" disabledDates={(date) => {
                const day = format(date, "yyyy-MM-dd");
                return day < placementStart || day > today;
              }} />
              <FormField control={form.control} name="notes" render={({ field }) => <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea {...field} value={field.value ?? ""} /></FormControl>
                <FormMessage />
              </FormItem>} />
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => guard.guardedOnOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Record treatment</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    <DiscardChangesDialog open={guard.isConfirmOpen} onConfirm={guard.confirmDiscard} onCancel={guard.cancelDiscard} subject="treatment" />
  </>;
}
