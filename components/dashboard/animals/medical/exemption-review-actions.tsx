"use client";

import { useRef } from "react";
import { CalendarPlus, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MedicalEntryKind,
  type SpayNeuterExemptionReason,
  type SurgeryProcedure,
} from "@/prisma/generated/enums";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import { SURGERY_PROCEDURE_LABELS } from "@/app/lib/constants/medical";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { ScheduleMedicalEntryForm } from "./schedule-medical-entry-form";
import { SpayNeuterExemptionForm } from "./spay-neuter-exemption-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";
import { EntryFormLoading, useEntryFormOptions } from "./use-entry-form-options";

/** The exemption open for review, as its buttons need it. */
export interface ReviewedExemption {
  procedure: SurgeryProcedure;
  exemptionReason: SpayNeuterExemptionReason;
}

interface Props {
  animalId: string;
  exemption: ReviewedExemption;
  /**
   * What the forms offer for this animal. Left out on a page that lists many
   * animals' care: the forms read them when they open.
   */
  options?: MedicalEntryFormOptions;
  /**
   * The animal's name, on a page that lists more than one animal's care, so
   * each button and dialog says whose it is.
   */
  animalName?: string;
}

/**
 * The buttons on a spay/neuter exemption that is due for review: schedule
 * the spay or neuter, or record a new exemption to extend it. Either one
 * replaces the exemption under review, so it leaves the due list. Both plan
 * the animal's care, so they are for a viewer who may manage it. Neither is
 * offered once the animal has left the shelter's care: nothing new is planned
 * for it. A page that lists many animals' care leaves out `options`, and
 * lists only animals in care.
 */
export function ExemptionReviewActions({
  animalId,
  exemption,
  options,
  animalName,
}: Props) {
  if (options && !options.inCare) return null;
  const forName = animalName ? ` for ${animalName}` : "";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <ReviewDialogButton
        action="schedule"
        animalId={animalId}
        exemption={exemption}
        options={options}
        accessibleName={`Schedule spay/neuter${forName}`}
        title={`Schedule a ${SURGERY_PROCEDURE_LABELS[exemption.procedure].toLowerCase()}${forName}`}
        description="Plan it for the day it is due. Once it is scheduled, the exemption is no longer up for review."
      />
      <ReviewDialogButton
        action="exempt"
        animalId={animalId}
        exemption={exemption}
        options={options}
        accessibleName={`Record a new exemption${forName}`}
        title={`Record a new spay/neuter exemption${forName}`}
        description="The new exemption replaces the one under review. Pick a review date to look at it again, or leave it empty to keep it until it is voided."
      />
    </div>
  );
}

function ReviewDialogButton({
  action,
  animalId,
  exemption,
  options,
  accessibleName,
  title,
  description,
}: {
  /** Schedule the spay or neuter, or record a new exemption. */
  action: "schedule" | "exempt";
  animalId: string;
  exemption: ReviewedExemption;
  options?: MedicalEntryFormOptions;
  accessibleName: string;
  title: string;
  description: string;
}) {
  const { open, setOpen, openDialog, formOptions } = useEntryFormOptions(
    animalId,
    options,
  );
  const formRef = useRef<DirtyFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => formRef.current?.isDirty() ?? false, setOpen);
  // Either action takes the review off the due list, button and all.
  const { triggerRef, returnFocus } = useEntryDialogFocus();

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        aria-label={accessibleName}
        onClick={openDialog}
      >
        {action === "schedule" ? (
          <CalendarPlus className="mr-2 size-4" />
        ) : (
          <ShieldOff className="mr-2 size-4" />
        )}
        {action === "schedule" ? "Schedule spay/neuter" : "Record a new exemption"}
      </Button>
      <Dialog open={open} onOpenChange={guardedOnOpenChange}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={returnFocus}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {!formOptions ? (
            <EntryFormLoading />
          ) : action === "schedule" ? (
            <ScheduleMedicalEntryForm
              animalId={animalId}
              options={formOptions}
              initial={{
                kind: MedicalEntryKind.SURGERY,
                procedure: exemption.procedure,
              }}
              onFormSubmit={() => setOpen(false)}
              ref={formRef}
            />
          ) : (
            <SpayNeuterExemptionForm
              animalId={animalId}
              mode={{
                record: {
                  sex: formOptions.sex,
                  procedure: exemption.procedure,
                  exemptionReason: exemption.exemptionReason,
                },
              }}
              today={formOptions.today}
              submitLabel="Record exemption"
              onFormSubmit={() => setOpen(false)}
              ref={formRef}
            />
          )}
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </>
  );
}
