"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { CalendarClock, CircleSlash, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Form } from "@/components/ui/form";
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DayField } from "@/components/forms/day-field";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import {
  declineMedicalEntry,
  rescheduleMedicalEntry,
} from "@/app/lib/actions/medical-entry.actions";
import { RescheduleMedicalEntrySchema } from "@/app/lib/zod-schemas/medical-entry.schemas";
import { MEDICAL_REASON_MAX_LENGTH } from "@/app/lib/constants/medical";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { dueDateIssue, latestDueDate } from "@/app/lib/utils/medical-days";
import {
  formatShelterDayOrNA,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import type { FieldErrors } from "@/app/lib/action-result";
import { entryLabel } from "./medical-entry-item";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";

interface Props {
  entry: MedicalEntryDisplay;
  /** The shelter's today: a due day can't be before it. */
  today: CalendarDay;
  canManage: boolean;
  canAdminister: boolean;
}

/**
 * The buttons on a row of the due list: Reschedule to plan care for another
 * day, and Decline when it won't be given.
 */
export function ScheduledEntryActions({
  entry,
  today,
  canManage,
  canAdminister,
}: Props) {
  if (!canManage && !canAdminister) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {canManage && <RescheduleButton entry={entry} today={today} />}
      {canAdminister && <DeclineButton entry={entry} />}
    </div>
  );
}

type RescheduleState = { dueDate: string | null };

function RescheduleButton({
  entry,
  today,
}: {
  entry: MedicalEntryDisplay;
  today: CalendarDay;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { triggerRef, returnFocus } = useEntryDialogFocus();
  const latest = latestDueDate(today);
  const form = useForm<RescheduleState>({
    // The schema turns the day string into a calendar day; the form holds
    // the string.
    resolver: standardSchemaResolver(
      RescheduleMedicalEntrySchema,
    ) as unknown as Resolver<RescheduleState>,
    defaultValues: { dueDate: entry.dueDate },
  });

  // Each opening starts from the day it is due now.
  const openDialog = () => {
    form.reset({ dueDate: entry.dueDate });
    setOpen(true);
  };
  const onOpenChange = (next: boolean) => {
    if (!isPending) setOpen(next);
  };

  const onSubmit = ({ dueDate }: RescheduleState) => {
    // Checked as the server checks them, so the refusal comes before
    // anything is sent.
    const issue =
      dueDate === entry.dueDate
        ? "That is already its due date. Pick another day."
        : dueDate && dueDateIssue(dueDate as CalendarDay, today);
    if (issue) {
      form.setError("dueDate", { type: "manual", message: issue });
      return;
    }
    startTransition(async () => {
      const result = await rescheduleMedicalEntry(entry.id, {
        dueDate: dueDate ?? "",
      });
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<RescheduleState>);
      toast.error(result.message);
      // Refused for a reason other than the day, most likely because someone
      // gave, declined or voided it first. Refreshing shows it as it now is.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Reschedule ${entryLabel(entry)}`}
        onClick={openDialog}
      >
        <CalendarClock className="mr-2 size-4" />
        Reschedule
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[420px]" onCloseAutoFocus={returnFocus}>
          <DialogHeader>
            <DialogTitle>Reschedule {entry.item.name}</DialogTitle>
            <DialogDescription>
              It is due {formatShelterDayOrNA(entry.dueDate)}. Pick the day it
              is due instead. The change is kept in the entry&apos;s history.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <DayField
                control={form.control}
                name="dueDate"
                label="Due date"
                required
                triggerClassName="w-full"
                disabledDates={(date) => {
                  const day = format(date, "yyyy-MM-dd");
                  return day < today || day > latest;
                }}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isPending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Reschedule
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeclineButton({ entry }: { entry: MedicalEntryDisplay }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  // A decline takes the row off the due list, button and all.
  const { triggerRef, returnFocus } = useEntryDialogFocus();
  const what = entryLabel(entry);

  // Checked as the server checks it, trimmed, so an over-long reason is
  // explained before anything is sent.
  const trimmedLength = reason.trim().length;
  const tooLong = trimmedLength > MEDICAL_REASON_MAX_LENGTH;
  const shownError = tooLong
    ? `The reason cannot exceed ${MEDICAL_REASON_MAX_LENGTH} characters.`
    : reasonError;

  const handleDecline = () => {
    setReasonError(undefined);
    startTransition(async () => {
      const result = await declineMedicalEntry(entry.id, { reason });
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        setReason("");
        return;
      }
      setReasonError(result.fieldErrors?.reason?.[0]);
      toast.error(result.message);
      // Refused for a reason other than the form's, most likely because
      // someone gave, declined or voided it first.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Decline ${what}`}
        onClick={() => setOpen(true)}
      >
        <CircleSlash className="mr-2 size-4" />
        Decline
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (isPending) return;
          setOpen(next);
          if (!next) {
            setReason("");
            setReasonError(undefined);
          }
        }}
      >
        <AlertDialogContent onCloseAutoFocus={returnFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline {what}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Declining records that this care won&apos;t be given. The
                  entry leaves the due list and stays on the record as
                  declined, with your reason.
                </p>
                <p>
                  A decline is final. If it was a mistake, void the entry and
                  schedule it again.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(undefined);
              }}
              placeholder="Why won't it be given?"
              aria-label="Reason for declining"
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
                handleDecline();
              }}
              disabled={isPending || trimmedLength === 0 || tooLong}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Decline Entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
