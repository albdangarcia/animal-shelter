"use client";

import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Ban, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DayField } from "@/components/forms/day-field";
import { MedicationDoseResult } from "@/prisma/generated/enums";
import {
  recordMedicationDose,
  voidMedicationDose,
} from "@/app/lib/actions/medication.actions";
import {
  MedicationDoseFormSchema,
  type MedicationDoseFormInput,
} from "@/app/lib/zod-schemas/medication.schemas";
import { MEDICATION_DOSE_RESULT_LABELS } from "@/app/lib/constants/medical";
import type { DoseView, SlotView } from "@/app/lib/data/animals/medication.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  haveFormValuesChanged,
  useConfirmedOpenChange,
  type DirtyFormHandle,
} from "@/hooks/use-confirmed-open-change";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { VoidReasonDialog } from "./void-reason-dialog";

/**
 * Focus for controls that go once they've done their work: a slot's Give
 * and menu once its dose is recorded, a dose's Void once it is voided. The
 * slot's cell stays, so focus goes there: when the save lands (unless the
 * person moved focus elsewhere while it was out), and when the controls
 * leave while focus was on them, in their dialog (the update can arrive
 * before the dialog has closed) or elsewhere in the cell. A dialog closed without saving hands focus
 * back to the control that opened it.
 *
 * Focus lost to the page (a button disabled while its save is out drops it)
 * is handed to the cell only once the controls were used. In development
 * React mounts each component twice, running the cleanup on load, when
 * nothing has focus yet: without that check every page load would move focus
 * to the first open slot and scroll the page to it.
 */
function useSlotFocus(cellId: string | undefined) {
  const rootId = useId();
  const dialogId = useId();
  const saved = useRef(false);
  const used = useRef(false);
  const focusCell = () => {
    if (cellId) document.getElementById(cellId)?.focus();
  };
  useLayoutEffect(
    () => () => {
      const active = document.activeElement;
      const cell = cellId ? document.getElementById(cellId) : null;
      const ours = [rootId, dialogId].some((id) => document.getElementById(id)?.contains(active));
      // Elsewhere in the cell, such as the sheet row's checkbox: a slot that
      // takes no more doses loses it along with the controls.
      const inCell = !!cell && cell !== active && cell.contains(active);
      const lost = !active || active === document.body;
      if (cell && (ours || inCell || (used.current && lost))) cell.focus();
    },
    [cellId, rootId, dialogId],
  );
  /** Marks the controls used: a save started, or a dialog opened. */
  const markUsed = () => {
    used.current = true;
  };
  /** After a save from the controls themselves (not a dialog) lands: focus
   * it dropped, or focus still on them, goes to the cell. Focus the person
   * moved elsewhere while it was out stays there. */
  const handBack = () => {
    const active = document.activeElement;
    const ours = document.getElementById(rootId)?.contains(active);
    if (!active || active === document.body || ours) focusCell();
  };
  /** After such a save was refused: focus goes back as `handBack` says, and
   * the controls count as unused again, so a later update that takes them
   * away leaves focus alone. */
  const settleRefused = () => {
    handBack();
    used.current = false;
  };
  /** Marks the dialog's work done, so it hands focus to the cell. */
  const markSaved = () => {
    saved.current = true;
  };
  /** For the dialog's `onCloseAutoFocus`: the cell after a save, otherwise
   * the control that opened it, while it is still there. */
  const returnFocus = (trigger: HTMLElement | null) => (event: Event) => {
    event.preventDefault();
    if (saved.current || !trigger?.isConnected) focusCell();
    else {
      trigger.focus();
      used.current = false;
    }
    saved.current = false;
  };
  return { rootId, dialogId, markUsed, markSaved, handBack, settleRefused, returnFocus };
}

/** What the viewer may do with doses, and the shelter's time when the page
 * was read, which the dose form starts from. */
export interface DoseControls {
  /** Give, refuse and record doses. */
  canAdminister: boolean;
  /** Void a dose recorded in error. */
  canManage: boolean;
  /** An animal that has left care takes no dose. */
  inCare: boolean;
  today: CalendarDay;
  /** The shelter's clock, `"HH:mm"`. */
  time: string;
}

type DoseMode = "REFUSED" | "NOT_GIVEN" | "DETAILS";

type DoseFormState = {
  result: MedicationDoseResult;
  reason: string;
  givenDate: string | null;
  givenTime: string;
  notes: string;
};

interface DoseFormHandle extends DirtyFormHandle {
  isPending: () => boolean;
}

/**
 * Records a dose that wasn't simply given now: refused or not given (with
 * why), or with its details, the day and time on the shelter's clock it was
 * given or tried, and notes. An as-needed dose's day is the day it was
 * given.
 */
function DoseForm({
  slot,
  mode,
  controls,
  days,
  onDone,
  ref,
}: {
  slot: SlotView;
  mode: DoseMode;
  controls: DoseControls;
  /** For an as-needed dose recorded from its order: the days it ran. */
  days?: { from: CalendarDay; to: CalendarDay };
  onDone: () => void;
  ref?: React.Ref<DoseFormHandle>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const asNeeded = slot.slot === null;
  const details = mode === "DETAILS";
  // A slot's dose is given now unless said otherwise; an as-needed dose on
  // the day of its row, now when that is today.
  const startDay = asNeeded ? slot.slotDate : controls.today;
  const form = useForm<DoseFormState>({
    resolver: standardSchemaResolver(
      MedicationDoseFormSchema,
    ) as unknown as Resolver<DoseFormState>,
    defaultValues: {
      result: mode === "DETAILS" ? MedicationDoseResult.GIVEN : mode,
      reason: "",
      givenDate: details ? startDay : null,
      givenTime: details && startDay === controls.today ? controls.time : "",
      notes: "",
    },
  });
  const result = useWatch({ control: form.control, name: "result" });
  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => haveFormValuesChanged(form.getValues(), initialValuesRef.current),
      isPending: () => isPending,
    }),
    [form, isPending],
  );

  const onSubmit = (state: DoseFormState) => {
    const values = state as unknown as MedicationDoseFormInput;
    startTransition(async () => {
      const saved = await recordMedicationDose(
        slot.orderId,
        { slotDate: slot.slotDate, slot: slot.slot },
        values,
      );
      if (saved.ok) {
        toast.success(saved.message);
        onDone();
        return;
      }
      applyFieldErrors(form, saved.fieldErrors as FieldErrors<DoseFormState>);
      toast.error(saved.message);
      // The slot was taken, or the order changed, since the page was read.
      if (!saved.fieldErrors) router.refresh();
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={isPending} className="m-0 min-w-0 space-y-6 border-0 p-0">
          {details && (
            <FormField
              control={form.control}
              name="result"
              render={({ field }) => (
                <FormItem>
                  <FormLabel id="dose-result-label" required>
                    What happened
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      aria-labelledby="dose-result-label"
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value === MedicationDoseResult.GIVEN) {
                          form.setValue("reason", "");
                          form.clearErrors("reason");
                        }
                      }}
                      className="flex flex-wrap gap-4"
                    >
                      {Object.values(MedicationDoseResult).map((value) => (
                        <label key={value} className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value={value} />
                          {MEDICATION_DOSE_RESULT_LABELS[value]}
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {result !== MedicationDoseResult.GIVEN && (
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel
                    htmlFor="dose-reason"
                    required={result === MedicationDoseResult.NOT_GIVEN}
                  >
                    {result === MedicationDoseResult.NOT_GIVEN ? "Why not" : "Reason"}
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      id="dose-reason"
                      placeholder={
                        result === MedicationDoseResult.NOT_GIVEN
                          ? "Why wasn't it given?"
                          : "Anything worth knowing about the refusal (optional)"
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {details && (
            <div className="grid gap-6 sm:grid-cols-2">
              <DayField
                control={form.control}
                name="givenDate"
                label={asNeeded ? "Date given" : "Date given or tried"}
                required
                triggerClassName="w-full"
                disabledDates={(date) => {
                  const day = format(date, "yyyy-MM-dd");
                  // A slot's dose can be given late, never before its day;
                  // an as-needed dose on a day its order ran.
                  return (
                    day > controls.today ||
                    (!asNeeded && day < slot.slotDate) ||
                    (!!days && (day < days.from || day > days.to))
                  );
                }}
              />
              <FormField
                control={form.control}
                name="givenTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="dose-given-time" required>
                      Time
                    </FormLabel>
                    <FormControl>
                      <Input id="dose-given-time" type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="dose-notes">Notes</FormLabel>
                <FormControl>
                  <Textarea id="dose-notes" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Dose
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const DIALOG_TEXT: Record<DoseMode, { title: (label: string) => string; description: string }> = {
  REFUSED: {
    title: (label) => `Record ${label} as refused`,
    description: "The animal wouldn't take it, now. The slot is accounted for, not missed.",
  },
  NOT_GIVEN: {
    title: (label) => `Record ${label} as not given`,
    description: "It wasn't given, now, for a reason. The slot is accounted for, not missed.",
  },
  DETAILS: {
    title: (label) => `Record ${label}`,
    description: "What happened, and when on the shelter's clock. A dose given late is still given.",
  },
};

/**
 * Give, which records the slot as given now in one click, and beside it a
 * menu: Refused, Not given and Record with details, each in a dialog. Shown
 * on a slot that can take a dose, to those who give doses.
 */
export function DoseSlotActions({
  slot,
  controls,
  fallbackId,
}: {
  slot: SlotView;
  controls: DoseControls;
  /** Where focus goes when the controls are gone, after the dose saves. */
  fallbackId?: string;
}) {
  const router = useRouter();
  const [isGiving, startGiving] = useTransition();
  const [mode, setMode] = useState<DoseMode | null>(null);
  const formRef = useRef<DoseFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      (open) => !open && setMode(null),
    );
  const focus = useSlotFocus(fallbackId);
  const menuRef = useRef<HTMLButtonElement>(null);
  const openForm = (next: DoseMode) => {
    focus.markUsed();
    setMode(next);
  };

  const onGive = () => {
    focus.markUsed();
    startGiving(async () => {
      const result = await recordMedicationDose(
        slot.orderId,
        { slotDate: slot.slotDate, slot: slot.slot },
        { result: MedicationDoseResult.GIVEN },
      );
      if (result.ok) {
        toast.success(result.message);
        focus.handBack();
        return;
      }
      toast.error(result.message);
      focus.settleRefused();
      // The slot was taken, or the order changed, since the page was read.
      router.refresh();
    });
  };

  return (
    <div id={focus.rootId} className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isGiving}
        onClick={onGive}
        aria-label={`Give ${slot.label}`}
      >
        {isGiving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        Give
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={menuRef}
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={isGiving}
            aria-label={`Other ways to record ${slot.label}`}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => openForm("REFUSED")}>Refused…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openForm("NOT_GIVEN")}>Not given…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openForm("DETAILS")}>
            Record with details…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={mode !== null}
        onOpenChange={(open) => !formRef.current?.isPending() && guardedOnOpenChange(open)}
      >
        <DialogContent
          id={focus.dialogId}
          className="sm:max-w-[560px]"
          onCloseAutoFocus={(event) => focus.returnFocus(menuRef.current)(event)}
        >
          {mode && (
            <>
              <DialogHeader>
                <DialogTitle>{DIALOG_TEXT[mode].title(slot.label)}</DialogTitle>
                <DialogDescription>{DIALOG_TEXT[mode].description}</DialogDescription>
              </DialogHeader>
              <DoseForm
                slot={slot}
                mode={mode}
                controls={controls}
                onDone={() => {
                  focus.markSaved();
                  setMode(null);
                }}
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
        subject="dose"
      />
    </div>
  );
}

/** "given 8:12 AM", "refused Oct 15, 2026, 8:12 AM". */
const doseWhen = (dose: DoseView) =>
  `${MEDICATION_DOSE_RESULT_LABELS[dose.result].toLowerCase()} ${dose.givenAt}`;

/**
 * Voids a dose recorded in error, with a reason. The slot can then be
 * recorded again. For those who correct care.
 */
export function VoidDoseButton({
  dose,
  label,
  fallbackId,
}: {
  dose: DoseView;
  /** The slot's label: "Doxycycline, AM dose on Oct 14, 2026". */
  label: string;
  fallbackId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const focus = useSlotFocus(fallbackId);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <span id={focus.rootId}>
      <Button
        ref={triggerRef}
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={() => {
          focus.markUsed();
          setIsOpen(true);
        }}
        aria-label={`Void ${label}, ${doseWhen(dose)}`}
      >
        <Ban className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      <VoidReasonDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={`Void ${label} (${doseWhen(dose)})?`}
        description={
          <>
            <p>
              This is for a dose recorded in error: on the wrong slot, the
              wrong day or the wrong animal.
            </p>
            <p>
              It stays on the sheet, struck through, and the slot can be
              recorded again. A void can&apos;t be undone.
            </p>
          </>
        }
        confirmLabel="Void Dose"
        onVoid={async (reason) => {
          const result = await voidMedicationDose(dose.id, { reason });
          if (result.ok) focus.markSaved();
          return result;
        }}
        onCloseAutoFocus={(event) => focus.returnFocus(triggerRef.current)(event)}
        contentId={focus.dialogId}
      />
    </span>
  );
}

/**
 * Records a dose of an as-needed order on any day it ran, with its details:
 * the dose sheet lists only the last few days, and a past course's run only
 * the days that already have a dose. Starts on the order's last day, today
 * while it runs.
 */
export function RecordAsNeededDoseButton({
  orderId,
  itemName,
  days,
  controls,
}: {
  orderId: string;
  itemName: string;
  days: { from: CalendarDay; to: CalendarDay };
  controls: DoseControls;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const formRef = useRef<DoseFormHandle>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => formRef.current?.isDirty() ?? false, setIsOpen);
  const slot: SlotView = {
    key: `${orderId}:any:PRN`,
    orderId,
    slotDate: days.to,
    slot: null,
    expected: false,
    state: null,
    doses: [],
    voidedDoses: [],
    recordable: true,
    label: `${itemName}, as-needed dose`,
  };
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(true)}
        aria-label={`Record a ${itemName} dose`}
      >
        Record a dose…
      </Button>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => !formRef.current?.isPending() && guardedOnOpenChange(open)}
      >
        <DialogContent
          className="sm:max-w-[560px]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Record a {itemName} dose</DialogTitle>
            <DialogDescription>
              An as-needed dose, on any day the order ran: what happened, and
              when on the shelter&apos;s clock.
            </DialogDescription>
          </DialogHeader>
          {isOpen && (
            <DoseForm
              slot={slot}
              mode="DETAILS"
              controls={controls}
              days={days}
              onDone={() => setIsOpen(false)}
              ref={formRef}
            />
          )}
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        subject="dose"
      />
    </>
  );
}
