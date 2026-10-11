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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import { MEDICAL_ITEM_KIND_LABELS } from "@/app/lib/constants/medical";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { MedicalEntryForm } from "./medical-entry-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";

interface Props {
  animalId: string;
  options: MedicalEntryFormOptions;
}

/** Where focus goes when the entry it was on is voided and leaves the page. */
export const ADD_ENTRY_BUTTON_ID = "add-medical-entry";

/** "+ Add entry": pick a kind, then record it in a dialog. */
export function AddMedicalEntryMenu({ animalId, options }: Props) {
  const [kind, setKind] = useState<MedicalEntryKind | null>(null);
  const formRef = useRef<DirtyFormHandle>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      (open) => !open && setKind(null),
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
          {Object.values(MedicalEntryKind).map((value) => (
            <DropdownMenuItem key={value} onSelect={() => setKind(value)}>
              {MEDICAL_ITEM_KIND_LABELS[value]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={kind !== null} onOpenChange={guardedOnOpenChange}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={returnFocus}
        >
          {kind && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Record a {MEDICAL_ITEM_KIND_LABELS[kind].toLowerCase()}
                </DialogTitle>
                <DialogDescription>
                  Record care already given. Pick the item first: its defaults
                  fill in the rest.
                </DialogDescription>
              </DialogHeader>
              <MedicalEntryForm
                key={kind}
                animalId={animalId}
                kind={kind}
                options={options}
                onFormSubmit={() => setKind(null)}
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
