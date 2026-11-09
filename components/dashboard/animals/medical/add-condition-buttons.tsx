"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MedicalConditionType,
  type CareEpisodeType,
} from "@/prisma/generated/enums";
import type { ConditionFormChoices } from "@/app/lib/data/animals/medical-condition.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { ConditionForm, type ConditionFormMode } from "./condition-form";
import { CareEpisodeForm } from "./care-episode-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import {
  CARE_EPISODES_HEADING_ID,
  useEntryDialogFocus,
} from "./use-entry-dialog-focus";

/** A button that opens a form in a dialog, which asks before losing changes. */
function FormDialogButton({
  label,
  title,
  description,
  variant = "outline",
  fallbackId,
  children,
}: {
  label: string;
  title: string;
  description: string;
  variant?: "outline" | "default";
  /** Where focus goes if what the form saved takes the button away. */
  fallbackId?: string;
  children: (props: {
    onFormSubmit: () => void;
    ref: React.Ref<DirtyFormHandle>;
  }) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const formRef = useRef<DirtyFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => formRef.current?.isDirty() ?? false, setIsOpen);
  const { triggerRef, returnFocus } = useEntryDialogFocus(fallbackId);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant={variant}
        onClick={() => setIsOpen(true)}
      >
        <Plus className="mr-1 h-4 w-4" />
        {label}
      </Button>
      <Dialog open={isOpen} onOpenChange={guardedOnOpenChange}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={returnFocus}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children({ onFormSubmit: () => setIsOpen(false), ref: formRef })}
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

interface ConditionProps {
  animalId: string;
  choices: ConditionFormChoices;
  today: CalendarDay;
}

/** "Add condition" and "Add allergy", each opening the problem-list form. */
export function AddConditionButtons({ animalId, choices, today }: ConditionProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {[MedicalConditionType.CONDITION, MedicalConditionType.ALLERGY].map((type) => (
        <AddConditionButton
          key={type}
          animalId={animalId}
          choices={choices}
          today={today}
          mode={{ add: { type } }}
        />
      ))}
    </div>
  );
}

/**
 * One button opening the problem-list form to add a row: a condition or an
 * allergy, or one found on a test or an exam, started from it.
 */
export function AddConditionButton({
  animalId,
  choices,
  today,
  mode,
  label,
}: ConditionProps & {
  mode: Extract<ConditionFormMode, { add: unknown }>;
  /** The button's text, when it isn't "Add condition" or "Add allergy". */
  label?: string;
}) {
  const allergy = mode.add.type === MedicalConditionType.ALLERGY;
  return (
    <FormDialogButton
      label={label ?? (allergy ? "Add allergy" : "Add condition")}
      title={allergy ? "Add an allergy" : "Add a condition"}
      description={
        allergy
          ? "Anyone handling or treating the animal sees its allergies first."
          : "A condition the animal has, had or arrived with, and where it was found."
      }
    >
      {({ onFormSubmit, ref }) => (
        <ConditionForm
          animalId={animalId}
          mode={mode}
          choices={choices}
          today={today}
          submitLabel={allergy ? "Add Allergy" : "Add Condition"}
          onFormSubmit={onFormSubmit}
          ref={ref}
        />
      )}
    </FormDialogButton>
  );
}

/** "Open care episode", opening the episode form. */
export function OpenCareEpisodeButton({
  animalId,
  vetClinics,
  today,
  type,
}: {
  animalId: string;
  vetClinics: { id: string; name: string }[];
  today: CalendarDay;
  type?: CareEpisodeType;
}) {
  return (
    <FormDialogButton
      label="Open care episode"
      title="Open a care episode"
      // Once an episode is open, the button goes.
      fallbackId={CARE_EPISODES_HEADING_ID}
      description="Under vet care, or hospitalised here or at a clinic. Give an end date to record care that is already over."
    >
      {({ onFormSubmit, ref }) => (
        <CareEpisodeForm
          animalId={animalId}
          mode={{ open: { type } }}
          vetClinics={vetClinics}
          today={today}
          submitLabel="Open Episode"
          onFormSubmit={onFormSubmit}
          ref={ref}
        />
      )}
    </FormDialogButton>
  );
}
