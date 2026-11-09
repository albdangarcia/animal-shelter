"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import { MedicalEntryStatus } from "@/prisma/generated/enums";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import { voidMedicalEntry } from "@/app/lib/actions/medical-entry.actions";
import {
  MEDICAL_ENTRY_KIND_LABELS,
  isOrdinaryCareKind,
  MEDICAL_REASON_MAX_LENGTH,
} from "@/app/lib/constants/medical";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { CareEntryForm } from "./care-entry-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";
import { entryLabel } from "./medical-entry-item";

interface Props {
  animalId: string;
  entry: MedicalEntryDisplay;
  options: MedicalEntryFormOptions;
}

/**
 * The row menu for one entry that isn't voided: Void, and Edit when it was
 * given. Care not given isn't corrected in place: scheduled care is
 * rescheduled, or voided and scheduled again, and a decline is final.
 */
export function MedicalEntryActions({ animalId, entry, options }: Props) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<DirtyFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      setIsEditOpen,
    );
  // The dialogs open from a menu item that is gone by the time they close.
  const { triggerRef, returnFocus } = useEntryDialogFocus();

  // Checked as the server checks it, trimmed, so an over-long reason is
  // explained before anything is sent.
  const trimmedLength = reason.trim().length;
  const tooLong = trimmedLength > MEDICAL_REASON_MAX_LENGTH;
  const shownError = tooLong
    ? `The reason cannot exceed ${MEDICAL_REASON_MAX_LENGTH} characters.`
    : reasonError;
  const what = entryLabel(entry);
  const given = entry.status === MedicalEntryStatus.COMPLETED;
  const noun = MEDICAL_ENTRY_KIND_LABELS[entry.kind].toLowerCase();

  if (!isOrdinaryCareKind(entry.kind)) return null;

  const handleVoid = () => {
    setReasonError(undefined);
    startTransition(async () => {
      const result = await voidMedicalEntry(entry.id, { reason });
      if (result.ok) {
        toast.success(result.message);
        setIsVoidOpen(false);
        setReason("");
        return;
      }
      setReasonError(result.fieldErrors?.reason?.[0]);
      toast.error(result.message);
      // Refused for a reason other than the form's, most likely because
      // someone voided it first. Refreshing shows the entry as it now is.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`Actions for ${what}`}
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {given && (
            <DropdownMenuItem onSelect={() => setIsEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setIsVoidOpen(true)}
          >
            <Ban className="mr-2 h-4 w-4" />
            Void…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isEditOpen} onOpenChange={guardedOnOpenChange}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={returnFocus}
        >
          <DialogHeader>
            <DialogTitle>Edit {noun}</DialogTitle>
            <DialogDescription>
              Correct what was recorded. Every change is kept in the
              entry&apos;s history, with what it was before.
            </DialogDescription>
          </DialogHeader>
          <CareEntryForm
            animalId={animalId}
            kind={entry.kind}
            options={options}
            entry={entry}
            onFormSubmit={() => setIsEditOpen(false)}
            ref={formRef}
          />
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />

      <AlertDialog
        open={isVoidOpen}
        onOpenChange={(open) => {
          if (isPending) return;
          setIsVoidOpen(open);
          if (!open) {
            setReason("");
            setReasonError(undefined);
          }
        }}
      >
        <AlertDialogContent onCloseAutoFocus={returnFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {what}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {given ? (
                <div className="space-y-2">
                  <p>
                    This is for an entry that should never have been
                    recorded, such as one entered against the wrong animal.
                    To fix a detail, edit it instead.
                  </p>
                  <p>
                    The entry stays in the history, struck through, and stops
                    counting. A void can&apos;t be undone: if it was right
                    after all, record it again.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>
                    This is for care that should never have been scheduled,
                    such as care scheduled for the wrong animal or the wrong
                    item.
                    {entry.status === MedicalEntryStatus.SCHEDULED &&
                      (options.inCare
                        ? " To move it to another day, reschedule it instead."
                        : " If it was right but won't be given now that the animal has left, decline it instead.")}
                  </p>
                  <p>
                    The entry stays in the history, struck through, and stops
                    counting.{" "}
                    {options.inCare
                      ? "A void can't be undone: if it was right after all, schedule it again."
                      : "A void can't be undone."}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(undefined);
              }}
              placeholder="Why is this entry being voided?"
              aria-label="Reason for voiding"
              aria-invalid={!!shownError}
              disabled={isPending}
            />
            {shownError && (
              <p className="text-destructive text-sm">{shownError}</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleVoid();
              }}
              disabled={isPending || trimmedLength === 0 || tooLong}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Void Entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
