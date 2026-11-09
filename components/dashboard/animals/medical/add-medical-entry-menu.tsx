"use client";

import { useRef, useState } from "react";
import { CalendarPlus, Plus, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import {
  ORDINARY_CARE_KINDS,
  type OrdinaryCareKind,
  MEDICAL_ENTRY_KIND_LABELS,
} from "@/app/lib/constants/medical";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { CareEntryForm, recordDialogDescription } from "./care-entry-form";
import { ScheduleMedicalEntryForm } from "./schedule-medical-entry-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { SpayNeuterExemptionForm } from "./spay-neuter-exemption-form";
import { ADD_ENTRY_BUTTON_ID } from "./use-entry-dialog-focus";

interface Props {
  animalId: string;
  options: MedicalEntryFormOptions;
}

// "a vaccine", "an exam".
const withArticle = (kind: OrdinaryCareKind) => {
  const noun = MEDICAL_ENTRY_KIND_LABELS[kind].toLowerCase();
  return `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
};

/**
 * What the menu's dialog is doing: recording care of a kind, scheduling, or
 * recording a spay/neuter exemption.
 */
type Mode = { record: OrdinaryCareKind } | "schedule" | "exemption";

/**
 * "+ Add entry": pick a kind and record care already given, schedule care
 * for a due day, or record that the animal is exempt from a spay or neuter,
 * in a dialog. An animal already spayed or neutered can't be exempt, so it
 * isn't offered one.
 */
export function AddMedicalEntryMenu({ animalId, options }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const kind = mode && typeof mode === "object" ? mode.record : null;
  const formRef = useRef<DirtyFormHandle>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      (open) => !open && setMode(null),
    );
  // The dialog opens from a menu item that is gone by the time it closes, so
  // focus goes back to the menu's button rather than to the page.
  const returnFocus = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" ref={triggerRef} id={ADD_ENTRY_BUTTON_ID}>
            <Plus className="mr-2 size-4" />
            Add entry
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {ORDINARY_CARE_KINDS.map((value) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => setMode({ record: value })}
            >
              {MEDICAL_ENTRY_KIND_LABELS[value]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setMode("schedule")}>
            <CalendarPlus className="mr-2 size-4" />
            Schedule…
          </DropdownMenuItem>
          {!options.altered && (
            <DropdownMenuItem onSelect={() => setMode("exemption")}>
              <ShieldOff className="mr-2 size-4" />
              Spay/neuter exemption…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode !== null} onOpenChange={guardedOnOpenChange}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={returnFocus}
        >
          {kind && (
            <>
              <DialogHeader>
                <DialogTitle>Record {withArticle(kind)}</DialogTitle>
                <DialogDescription>{recordDialogDescription(kind)}</DialogDescription>
              </DialogHeader>
              <CareEntryForm
                key={kind}
                animalId={animalId}
                kind={kind}
                options={options}
                onFormSubmit={() => setMode(null)}
                ref={formRef}
              />
            </>
          )}
          {mode === "schedule" && (
            <>
              <DialogHeader>
                <DialogTitle>Schedule care</DialogTitle>
                <DialogDescription>
                  Plan care for the day it is due. How it was given is
                  recorded when it is.
                </DialogDescription>
              </DialogHeader>
              <ScheduleMedicalEntryForm
                animalId={animalId}
                options={options}
                onFormSubmit={() => setMode(null)}
                ref={formRef}
              />
            </>
          )}
          {mode === "exemption" && (
            <>
              <DialogHeader>
                <DialogTitle>Record a spay/neuter exemption</DialogTitle>
                <DialogDescription>
                  Record why this animal isn&apos;t to be spayed or neutered,
                  for now or for good. It counts as exempt until the review
                  date, or until the exemption is voided.
                </DialogDescription>
              </DialogHeader>
              <SpayNeuterExemptionForm
                animalId={animalId}
                mode={{ record: { sex: options.sex } }}
                today={options.today}
                submitLabel="Record exemption"
                onFormSubmit={() => setMode(null)}
                ref={formRef}
              />
            </>
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
