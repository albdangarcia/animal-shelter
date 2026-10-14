"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { MEDICAL_REASON_MAX_LENGTH } from "@/app/lib/constants/medical";
import type { FormResult } from "@/app/lib/action-result";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Void Heartworm disease (condition)?" */
  title: string;
  /** What a void is for, and that it can't be undone. */
  description: ReactNode;
  /** The button's text: "Void Condition". */
  confirmLabel: string;
  onVoid: (reason: string) => Promise<FormResult<{ reason: string }>>;
  onCloseAutoFocus: (event: Event) => void;
}

/**
 * Asks why a medical record is being voided, and voids it. The button stays
 * off until a reason is given, and an over-long one is explained before
 * anything is sent.
 */
export function VoidReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onVoid,
  onCloseAutoFocus,
}: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  // Checked as the server checks it, trimmed.
  const trimmedLength = reason.trim().length;
  const tooLong = trimmedLength > MEDICAL_REASON_MAX_LENGTH;
  const shownError = tooLong
    ? `The reason cannot exceed ${MEDICAL_REASON_MAX_LENGTH} characters.`
    : reasonError;

  const handleVoid = () => {
    setReasonError(undefined);
    startTransition(async () => {
      const result = await onVoid(reason);
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
        setReason("");
        return;
      }
      setReasonError(result.fieldErrors?.reason?.[0]);
      toast.error(result.message);
      // Refused for a reason other than the form's, most likely because
      // someone voided it first. Refreshing shows the record as it now is.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        onOpenChange(next);
        if (!next) {
          setReason("");
          setReasonError(undefined);
        }
      }}
    >
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <Textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError(undefined);
            }}
            placeholder="Why is this being voided?"
            aria-label="Reason for voiding"
            aria-invalid={!!shownError}
            disabled={isPending}
          />
          {shownError && <p className="text-destructive text-sm">{shownError}</p>}
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
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
