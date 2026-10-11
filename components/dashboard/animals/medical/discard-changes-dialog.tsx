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

/** Asks before an entry form with unsaved changes is closed. */
export function DiscardChangesDialog({ open, onConfirm, onCancel }: Props) {
  // The prompt has no trigger of its own, so on Cancel focus goes back to
  // where it was in the form. On Discard that is gone with the form, and the
  // form's dialog sends focus on.
  const returnTo = useRef<HTMLElement | null>(null);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent
        onOpenAutoFocus={() => {
          returnTo.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnTo.current?.isConnected) returnTo.current.focus();
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
