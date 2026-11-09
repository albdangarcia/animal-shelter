"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { CalendarClock, CircleSlash, Loader2, Syringe } from "lucide-react";
import { isOrdinaryCareKind } from "@/app/lib/constants/medical";
import { MedicalEntryKind, SurgeryProcedure } from "@/prisma/generated/enums";
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
  medicalEntryName,
  type NameableMedicalEntry,
} from "@/app/lib/utils/medical-entry-name";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { entryLabel } from "./medical-entry-item";
import type { ScheduledCare } from "./medical-entry-form";
import { CareEntryForm } from "./care-entry-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";
import { EntryFormLoading, useEntryFormOptions } from "./use-entry-form-options";
import { SpayNeuterExemptionForm } from "./spay-neuter-exemption-form";

/** Scheduled care as its row shows it, and as its buttons need it. */
export type DueCare = ScheduledCare &
  Pick<MedicalEntryDisplay, "status" | "dueDate" | "completedDate"> &
  Pick<NameableMedicalEntry, "item">;

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

/** A spay or neuter, whose decline is an exemption. */
const isSpayOrNeuter = (entry: DueCare) =>
  entry.procedure === SurgeryProcedure.SPAY ||
  entry.procedure === SurgeryProcedure.NEUTER;

/**
 * The buttons on a row of the due list: Record when the care was given,
 * Reschedule to plan it for another day, and Decline when it won't be given.
 * Declining a spay or neuter records an exemption, which plans the animal's
 * care rather than gives it, so it is for a viewer who may manage care.
 *
 * Once the animal has left the shelter's care, its leftover scheduled care is
 * only closed: Decline here, or Void from the row's menu. Record and
 * Reschedule would invite care that can't happen now. A page that lists many
 * animals' care leaves out `options`, and lists only animals in care.
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
  if ((!canManage && !canAdminister) || !isOrdinaryCareKind(entry.kind)) return null;
  const inCare = options?.inCare ?? true;
  const canDecline = isSpayOrNeuter(entry) ? canManage : canAdminister;
  if (!inCare && !canDecline) return null;
  // "DHPP (Due Oct 14, 2026)", or "DHPP (Due Oct 14, 2026) for Fido".
  const what = animalName
    ? `${entryLabel(entry)} for ${animalName}`
    : entryLabel(entry);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {inCare && canAdminister && (
        <RecordButton
          animalId={animalId}
          entry={entry}
          options={options}
          animalName={animalName}
          what={what}
        />
      )}
      {inCare && canManage && (
        <RescheduleButton
          entry={entry}
          today={today}
          animalName={animalName}
          what={what}
        />
      )}
      {canDecline &&
        (isSpayOrNeuter(entry) ? (
          <DeclineAsExemptionButton
            animalId={animalId}
            entry={entry}
            today={today}
            what={what}
            inCare={inCare}
          />
        ) : (
          <DeclineButton entry={entry} what={what} inCare={inCare} />
        ))}
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
  const { open, setOpen, openDialog, formOptions } = useEntryFormOptions(
    animalId,
    options,
  );
  const formRef = useRef<DirtyFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => formRef.current?.isDirty() ?? false, setOpen);
  // Recording takes the row off the due list, button and all.
  const { triggerRef, returnFocus } = useEntryDialogFocus();

  if (!isOrdinaryCareKind(entry.kind)) return null;

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
              Record {medicalEntryName(entry)}
              {animalName && ` for ${animalName}`} as given
            </DialogTitle>
            <DialogDescription>
              It was due {formatShelterDayOrNA(entry.dueDate)}.{" "}
              {entry.kind === MedicalEntryKind.SURGERY
                ? "Record how it was done, and how it went."
                : entry.kind === MedicalEntryKind.MICROCHIP
                  ? "Record the chip's number, and how it was implanted."
                  : entry.kind === MedicalEntryKind.EXAM
                    ? "Record how it went: each body system's finding, and what it concluded."
                    : "Record how it was given: the item's defaults are filled in."}
            </DialogDescription>
          </DialogHeader>
          {formOptions ? (
            <CareEntryForm
              animalId={animalId}
              kind={entry.kind}
              options={formOptions}
              scheduled={entry}
              onFormSubmit={() => setOpen(false)}
              ref={formRef}
            />
          ) : (
            <EntryFormLoading />
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
              Reschedule {medicalEntryName(entry)}
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

function DeclineButton({
  entry,
  what,
  inCare,
}: {
  entry: DueCare;
  what: string;
  /** Whether the animal is still in care, so the entry can be scheduled
   * again after a mistaken decline is voided. */
  inCare: boolean;
}) {
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
                  {inCare
                    ? "A decline is final. If it was a mistake, void the entry and schedule it again."
                    : "A decline is final. If it was a mistake, void the entry."}
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

function DeclineAsExemptionButton({
  animalId,
  entry,
  today,
  what,
  inCare,
}: {
  animalId: string;
  entry: DueCare;
  today: CalendarDay;
  what: string;
  /** Whether the animal is still in care. Once it has left, the exemption
   * closes leftover care: it has no review day, and nothing new is planned. */
  inCare: boolean;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<DirtyFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => formRef.current?.isDirty() ?? false, setOpen);
  // A decline takes the row off the due list, button and all.
  const { triggerRef, returnFocus } = useEntryDialogFocus();
  const procedure = medicalEntryName(entry).toLowerCase();

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
      <Dialog open={open} onOpenChange={guardedOnOpenChange}>
        <DialogContent
          className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={returnFocus}
        >
          <DialogHeader>
            <DialogTitle>Decline {what}</DialogTitle>
            <DialogDescription>
              Declining a {procedure} records that the animal is exempt from
              it, and why. The entry stays on the record as declined.{" "}
              {inCare
                ? `A decline is final: to extend the exemption, record a new one, and to end it, schedule or record the ${procedure}.`
                : `A decline is final. The animal has left the shelter's care, so the exemption has no review date; if the ${procedure} is done, record it.`}
            </DialogDescription>
          </DialogHeader>
          <SpayNeuterExemptionForm
            animalId={animalId}
            mode={{ decline: { entryId: entry.id } }}
            today={today}
            reviewable={inCare}
            submitLabel="Decline Entry"
            onFormSubmit={() => setOpen(false)}
            ref={formRef}
          />
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
