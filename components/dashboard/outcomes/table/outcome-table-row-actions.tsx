"use client";

import type { Row, StockFeatures } from "@tanstack/react-table";
import { Loader2, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { OutcomeWithDetails } from "@/app/lib/data/animals/outcome.data";
import { reverseOutcome } from "@/app/lib/actions/outcome.actions";
import { REVERSAL_REASON_MAX_LENGTH } from "@/app/lib/zod-schemas/outcome.schema";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { OutcomeType } from "@/prisma/generated/enums";

interface DataTableRowActionsProps {
  row: Row<StockFeatures, OutcomeWithDetails>;
  canManage: boolean;
  canReverse: boolean;
}

export function DataTableRowActions({
  row,
  canManage,
  canReverse,
}: DataTableRowActionsProps) {
  const outcome = row.original;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  // A reversed outcome is kept on the record as it was voided: it cannot be
  // corrected, and a reversal is never undone. Its row is read-only.
  const isReversed = !!outcome.reversedAt;
  const showEdit = canManage && !isReversed;
  const showReverse = canReverse && !isReversed;

  // Volunteers (read-only) get no row actions — every field is already
  // visible in the table, and all actions here are mutations.
  if (!showEdit && !showReverse) {
    return null;
  }

  // Checked here as the server checks it, trimmed, so an over-long reason is
  // explained before anything is sent rather than after.
  const trimmedLength = reason.trim().length;
  const tooLong = trimmedLength > REVERSAL_REASON_MAX_LENGTH;
  const shownError = tooLong
    ? `The reason cannot exceed ${REVERSAL_REASON_MAX_LENGTH} characters.`
    : reasonError;

  const animalName = outcome.animal.name;
  const typeLabel = formatSingleEnumOption(outcome.type).toLowerCase();

  const handleReverse = () => {
    setReasonError(undefined);
    startTransition(async () => {
      const result = await reverseOutcome(outcome.id, { reason });

      if (result.ok) {
        toast.success(result.message);
        setIsDialogOpen(false);
        setReason("");
        return;
      }

      setReasonError(result.fieldErrors?.reason?.[0]);
      toast.error(result.message);
      // Refused for a reason other than the form's, most likely because
      // someone else reversed it first. Refreshing shows the row as it now
      // is, which also takes this dialog and its menu away.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <AlertDialog
      open={isDialogOpen}
      onOpenChange={(open) => {
        if (isPending) return;
        setIsDialogOpen(open);
        if (!open) {
          setReason("");
          setReasonError(undefined);
        }
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            disabled={isPending}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {showEdit && (
            <Link href={`/dashboard/outcomes/${outcome.id}/edit`}>
              <DropdownMenuItem>Edit</DropdownMenuItem>
            </Link>
          )}
          {showEdit && showReverse && <DropdownMenuSeparator />}
          {showReverse && (
            <AlertDialogTrigger asChild>
              <DropdownMenuItem variant="destructive">Reverse…</DropdownMenuItem>
            </AlertDialogTrigger>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Reverse {animalName}&apos;s {typeLabel} outcome?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This is for an outcome that should never have been recorded. If{" "}
                {animalName} left and came back, record a re-intake instead.
              </p>
              <p>
                The outcome stays on the record, marked as reversed, and stops
                counting in reports. If it is what archived {animalName}, the
                animal comes back into care.
                {outcome.type === OutcomeType.ADOPTION &&
                  " The adopter's application reads as approved again, and the applications this adoption closed reopen."}
              </p>
              <p>
                A reversal can&apos;t be undone. If the outcome was right after
                all, record it again.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <Textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              // The server's verdict was on the text as it was sent.
              setReasonError(undefined);
            }}
            placeholder="Why is this outcome being reversed?"
            aria-label="Reason for reversal"
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
              handleReverse();
            }}
            disabled={isPending || trimmedLength === 0 || tooLong}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reverse Outcome
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
