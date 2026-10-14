"use client";

import { useRef } from "react";
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

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// What can take focus in a form.
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The first control in the form's dialog still open under the prompt, for
 * when the prompt opened with focus on the page: a click on the overlay
 * moves it there before the prompt opens.
 */
const firstControlInOpenDialog = () => {
  const dialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"]',
  );
  const dialog = dialogs[dialogs.length - 1];
  return dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog ?? null;
};

/** Asks before an entry form with unsaved changes is closed. */
export function DiscardChangesDialog({ open, onConfirm, onCancel }: Props) {
  // The prompt has no trigger of its own, so on Cancel focus goes back to
  // where it was in the form, or to the form's first control when it was on
  // the page. On Discard the form is gone, and its dialog sends focus on.
  const returnTo = useRef<HTMLElement | null>(null);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          returnTo.current =
            active instanceof HTMLElement && active !== document.body
              ? active
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnTo.current?.isConnected
            ? returnTo.current
            : firstControlInOpenDialog();
          target?.focus();
          returnTo.current = null;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved entry?</AlertDialogTitle>
          <AlertDialogDescription>
            Your changes will be lost if you leave without saving.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
