"use client";

import { useRef, useState } from "react";
import { Ban, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";
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
import {
  removeMedicalDocumentFile,
  voidMedicalDocument,
} from "@/app/lib/actions/medical-document.actions";
import type {
  DocumentFormChoices,
  MedicalDocumentRow,
} from "@/app/lib/data/animals/medical-document.data";
import { useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";
import {
  MedicalDocumentForm,
  type DocumentFormHandle,
  type DocumentFormMode,
} from "./medical-document-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { VoidReasonDialog } from "./void-reason-dialog";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";

/** The Documents page's heading, where focus goes when a row's control goes:
 * after a void, or a file removed. */
export const DOCUMENTS_HEADING_ID = "medical-documents";

/**
 * A dialog holding the document form, which asks before losing changes and
 * doesn't close under a save.
 */
function DocumentFormDialog({
  open,
  onOpenChange,
  title,
  description,
  mode,
  choices,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  mode: DocumentFormMode;
  choices: DocumentFormChoices;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const formRef = useRef<DocumentFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => formRef.current?.isDirty() ?? false, onOpenChange);
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => !formRef.current?.isPending() && guardedOnOpenChange(next)}
      >
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <MedicalDocumentForm
            mode={mode}
            choices={choices}
            onFormSubmit={() => onOpenChange(false)}
            ref={formRef}
          />
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        subject="document"
      />
    </>
  );
}

/** "Upload document": opens the upload form. */
export function UploadDocumentButton({
  animalId,
  choices,
}: {
  animalId: string;
  choices: DocumentFormChoices;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, returnFocus } = useEntryDialogFocus(DOCUMENTS_HEADING_ID);
  return (
    <>
      <Button ref={triggerRef} size="sm" onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        Upload document
      </Button>
      <DocumentFormDialog
        open={open}
        onOpenChange={setOpen}
        title="Upload a document"
        description="A lab result, a vet record, imaging, a prescription or a consent form. Link it to the entry it belongs to, if any."
        mode={{ upload: { animalId } }}
        choices={choices}
        onCloseAutoFocus={returnFocus}
      />
    </>
  );
}

interface Props {
  document: MedicalDocumentRow;
  /** What the form offers; null without the permission to correct and void. */
  choices: DocumentFormChoices | null;
  /** Whether the viewer may remove a voided document's file. */
  canRemoveFile: boolean;
}

/**
 * The row menu of a document: Edit and Void while it is live, for staff who
 * manage medical care; Remove file once it is voided and its file still held,
 * for an admin. Null when the viewer can do none of them.
 */
export function MedicalDocumentActions({ document, choices, canRemoveFile }: Props) {
  const [open, setOpen] = useState<"edit" | "void" | "remove" | null>(null);
  const close = (next: boolean) => {
    if (!next) setOpen(null);
  };
  // The dialogs open from a menu item that is gone by the time they close.
  const { triggerRef, returnFocus } = useEntryDialogFocus(DOCUMENTS_HEADING_ID);
  const voided = !!document.voidedAt;
  const correctable = !voided && !!choices;
  const removable = voided && document.fileHeld && canRemoveFile;
  if (!correctable && !removable) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`Actions for ${document.name}`}
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {correctable && (
            <DropdownMenuItem onSelect={() => setOpen("edit")}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          {correctable && (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpen("void")}>
              <Ban className="mr-2 h-4 w-4" />
              Void…
            </DropdownMenuItem>
          )}
          {removable && (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpen("remove")}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remove file…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {choices && (
        <DocumentFormDialog
          open={open === "edit"}
          onOpenChange={close}
          title={`Edit ${document.name}`}
          description="Correct its details. Every change is kept in its history, with what it was before. The file itself can't change: if it is the wrong file, void this and upload the right one."
          mode={{ edit: document }}
          choices={choices}
          onCloseAutoFocus={returnFocus}
        />
      )}

      <VoidReasonDialog
        open={open === "void"}
        onOpenChange={close}
        title={`Void ${document.name}?`}
        description={
          <>
            <p>
              This is for a document that should never have been uploaded, such
              as one for the wrong animal or the wrong file. To fix its name,
              type or day, edit it instead.
            </p>
            <p>
              It stays in the list, struck through, with its file, and stops
              counting. A void can&apos;t be undone: if it was right after all,
              upload it again.
            </p>
          </>
        }
        confirmLabel="Void"
        onVoid={(reason) => voidMedicalDocument(document.id, { reason })}
        onCloseAutoFocus={returnFocus}
      />

      <VoidReasonDialog
        open={open === "remove"}
        onOpenChange={close}
        title={`Remove the file of ${document.name}?`}
        description={
          <>
            <p>
              This is for a file the shelter shouldn&apos;t hold, such as
              another animal&apos;s paperwork or someone&apos;s private details.
            </p>
            <p>
              The file is deleted for good. The document stays in the list,
              voided, saying who removed its file, when and why.
            </p>
          </>
        }
        confirmLabel="Remove file"
        reasonLabel="Reason for removing the file"
        placeholder="Why is this file being removed?"
        onVoid={(reason) => removeMedicalDocumentFile(document.id, { reason })}
        onCloseAutoFocus={returnFocus}
      />
    </>
  );
}
