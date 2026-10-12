"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { CalendarClock, CircleSlash, Loader2, Syringe } from "lucide-react";
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
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import {
  declineMedicalEntry,
  loadMedicalEntryFormOptions,
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
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { entryLabel } from "./medical-entry-item";
import { MedicalEntryForm, type ScheduledCare } from "./medical-entry-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";

/** Scheduled care as its row shows it, and as its buttons need it. */
export type DueCare = ScheduledCare &
  Pick<MedicalEntryDisplay, "status" | "dueDate" | "completedDate"> & {
    item: { name: string };
  };

interface Props {
  animalId: string;
  entry: DueCare;
  /**
   * What the record form offers for this animal. Left out on a page that
   * lists many animals' care: the form reads them when it opens.
   */
  options?: MedicalEntryFormOptions;
  /**
   * The animal's name, on a page that lists more than one animal's care, so
   * each button and dialog says whose care it is.
   */
  animalName?: string;
  /** The shelter's today: a due day can't be before it. */
  today: CalendarDay;
  canManage: boolean;
  canAdminister: boolean;
}

/**
 * The buttons on a row of the due list: Record when the care was given,
 * Reschedule to plan it for another day, and Decline when it won't be given.
 */
export function ScheduledEntryActions({
  animalId,
  entry,
  options,
  animalName,
  today,
  canManage,
  canAdminister,
}: Props) {
  if (!canManage && !canAdminister) return null;
  // "DHPP (Due Oct 14, 2026)", or "DHPP (Due Oct 14, 2026) for Fido".
  const what = animalName
    ? `${entryLabel(entry)} for ${animalName}`
    : entryLabel(entry);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {canAdminister && (
        <RecordButton
          animalId={animalId}
          entry={entry}
          options={options}
          animalName={animalName}
          what={what}
        />
      )}
      {canManage && (
        <RescheduleButton
          entry={entry}
          today={today}
          animalName={animalName}
          what={what}
        />
      )}
      {canAdminister && <DeclineButton entry={entry} what={what} />}
    </div>
  );
}

function RecordButton({
  animalId,
  entry,
  options,
  animalName,
  what,
}: {
  animalId: string;
  entry: DueCare;
  options?: MedicalEntryFormOptions;
  animalName?: string;
  what: string;
}) {
  const [open, setOpen] = useState(false);
  // The options the open form uses: the ones given, or the ones read when it
  // opened.
  const [formOptions, setFormOptions] = useState(options);
  // Counts the openings, so a read that answers after its dialog closed, or
  // after it was opened again, is dropped.
  const opening = useRef(0);
  const formRef = useRef<DirtyFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      (next: boolean) => {
        if (!next) opening.current++;
        setOpen(next);
      },
    );
  // Recording takes the row off the due list, button and all.
  const { triggerRef, returnFocus } = useEntryDialogFocus();

  const openDialog = () => {
    // Open at once, whether or not the options are here: the dialog holds
    // the page while they load, so no other row's form can open meanwhile.
    setOpen(true);
    if (options) {
      setFormOptions(options);
      return;
    }
    // Read each time it opens, so what the form offers (whether the next
    // dose is already planned, say) is as it is now.
    setFormOptions(undefined);
    const thisOpening = ++opening.current;
    void (async () => {
      let message: string;
      try {
        const result = await loadMedicalEntryFormOptions(animalId);
        if (thisOpening !== opening.current) return;
        if (result.ok) {
          setFormOptions(result.options);
          return;
        }
        message = result.message;
      } catch {
        if (thisOpening !== opening.current) return;
        message = "Could not load the form. Try again.";
      }
      toast.error(message);
      opening.current++;
      setOpen(false);
    })();
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Record ${what} as given`}
        onClick={openDialog}
      >
        <Syringe className="mr-2 size-4" />
        Record
      </Button>
      <Dialog open={open} onOpenChange={guardedOnOpenChange}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={returnFocus}
        >
          <DialogHeader>
            <DialogTitle>
              Record {entry.item.name}
              {animalName && ` for ${animalName}`} as given
            </DialogTitle>
            <DialogDescription>
              It was due {formatShelterDayOrNA(entry.dueDate)}. Record how it
              was given: the item&apos;s defaults are filled in.
            </DialogDescription>
          </DialogHeader>
          {formOptions ? (
            <MedicalEntryForm
              animalId={animalId}
              kind={entry.kind}
              options={formOptions}
              scheduled={entry}
              onFormSubmit={() => setOpen(false)}
              ref={formRef}
            />
          ) : (
            <p
              role="status"
              className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Loading the form…
            </p>
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

type RescheduleState = { dueDate: string | null };

function RescheduleButton({
  entry,
  today,
  animalName,
  what,
}: {
  entry: DueCare;
  today: CalendarDay;
  animalName?: string;
  what: string;
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
        aria-label={`Reschedule ${what}`}
        onClick={openDialog}
      >
        <CalendarClock className="mr-2 size-4" />
        Reschedule
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[420px]" onCloseAutoFocus={returnFocus}>
          <DialogHeader>
            <DialogTitle>
              Reschedule {entry.item.name}
              {animalName && ` for ${animalName}`}
            </DialogTitle>
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

function DeclineButton({ entry, what }: { entry: DueCare; what: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  // A decline takes the row off the due list, button and all.
  const { triggerRef, returnFocus } = useEntryDialogFocus();

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
