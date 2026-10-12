"use client";

import { useRef, useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";
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
import { MedicalEntryKind } from "@/prisma/generated/enums";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import {
  CATALOG_ENTRY_KINDS,
  MEDICAL_ENTRY_KIND_LABELS,
} from "@/app/lib/constants/medical";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { CareEntryForm, recordDialogDescription } from "./care-entry-form";
import { ScheduleMedicalEntryForm } from "./schedule-medical-entry-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { ADD_ENTRY_BUTTON_ID } from "./use-entry-dialog-focus";

interface Props {
  animalId: string;
  options: MedicalEntryFormOptions;
}

// Care given from the catalog first, then the kinds with forms of their own.
const RECORDED_KINDS: MedicalEntryKind[] = [
  ...CATALOG_ENTRY_KINDS,
  MedicalEntryKind.SURGERY,
  MedicalEntryKind.MICROCHIP,
];

/** What the menu's dialog is doing: recording care of a kind, or scheduling. */
type Mode = { record: MedicalEntryKind } | "schedule";

/**
 * "+ Add entry": pick a kind and record care already given, or schedule care
 * for a due day, in a dialog.
 */
export function AddMedicalEntryMenu({ animalId, options }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const kind = mode && mode !== "schedule" ? mode.record : null;
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
          {RECORDED_KINDS.map((value) => (
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
                <DialogTitle>
                  Record a {MEDICAL_ENTRY_KIND_LABELS[kind].toLowerCase()}
                </DialogTitle>
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
