"use client";

import { useImperativeHandle, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Ban, CircleSlash, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  discontinueMedicationOrder,
  voidMedicationOrder,
} from "@/app/lib/actions/medication.actions";
import {
  DiscontinueMedicationOrderSchema,
  type DiscontinueMedicationOrderInput,
} from "@/app/lib/zod-schemas/medication.schemas";
import type {
  AnimalMedicationOrder,
  MedicationOrderFormOptions,
  OrderSummary,
} from "@/app/lib/data/animals/medication.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { FieldErrors } from "@/app/lib/action-result";
import { useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";
import {
  MedicationOrderCorrectionForm,
  MedicationOrderForm,
  type MedicationOrderFormHandle,
} from "./medication-order-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { VoidReasonDialog } from "./void-reason-dialog";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";

/** The latest day with a live dose of the order, or null with none. */
const latestDoseDay = (order: AnimalMedicationOrder): CalendarDay | null =>
  order.doses
    .filter((dose) => !dose.voided)
    .map((dose) => dose.slotDate)
    .sort()
    .at(-1) ?? null;

/**
 * A dialog holding one of the order forms, which asks before losing changes
 * and doesn't close under a save.
 */
function OrderFormDialog({
  open,
  onOpenChange,
  title,
  description,
  onCloseAutoFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onCloseAutoFocus: (event: Event) => void;
  children: (props: {
    onFormSubmit: () => void;
    ref: React.Ref<MedicationOrderFormHandle>;
  }) => React.ReactNode;
}) {
  const formRef = useRef<MedicationOrderFormHandle>(null);
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
          {children({ onFormSubmit: () => onOpenChange(false), ref: formRef })}
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        subject="order"
      />
    </>
  );
}

const ORDER_DESCRIPTION =
  "Its medication, dose and how often never change once ordered: to change them, discontinue it and order again.";

/** "Order medication": opens the order form. */
export function OrderMedicationButton({
  animalId,
  options,
  fallbackId,
}: {
  animalId: string;
  options: MedicationOrderFormOptions;
  fallbackId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { triggerRef, returnFocus } = useEntryDialogFocus(fallbackId);
  return (
    <>
      <Button ref={triggerRef} type="button" size="sm" onClick={() => setIsOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        Order medication
      </Button>
      <OrderFormDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Order a medication"
        description={ORDER_DESCRIPTION}
        onCloseAutoFocus={returnFocus}
      >
        {({ onFormSubmit, ref }) => (
          <MedicationOrderForm
            animalId={animalId}
            options={options}
            onFormSubmit={onFormSubmit}
            ref={ref}
          />
        )}
      </OrderFormDialog>
    </>
  );
}

type DiscontinueFormState = { day: string | null; reason: string };

/**
 * Discontinues an order from a day, today unless another is picked: not
 * after today, not before its start or its last day with a live dose. One
 * that hasn't started is discontinued from today.
 */
function DiscontinueForm({
  order,
  today,
  onDone,
  ref,
}: {
  order: AnimalMedicationOrder;
  today: CalendarDay;
  onDone: () => void;
  ref?: React.Ref<MedicationOrderFormHandle>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<DiscontinueFormState>({
    resolver: standardSchemaResolver(
      DiscontinueMedicationOrderSchema,
    ) as unknown as Resolver<DiscontinueFormState>,
    defaultValues: { day: today, reason: "" },
  });
  const openedOn = useRef<string>(today);
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => {
        const values = form.getValues();
        return values.day !== openedOn.current || values.reason.trim() !== "";
      },
      isPending: () => isPending,
    }),
    [form, isPending],
  );
  const upcoming = order.startDate > today;
  const latestDose = latestDoseDay(order);
  const earliest = [order.startDate, latestDose ?? order.startDate].sort().at(-1)!;

  const onSubmit = (state: DiscontinueFormState) => {
    startTransition(async () => {
      const result = await discontinueMedicationOrder(
        order.id,
        state as DiscontinueMedicationOrderInput,
      );
      if (result.ok) {
        toast.success(result.message);
        onDone();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<DiscontinueFormState>);
      toast.error(result.message);
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={isPending} className="m-0 min-w-0 space-y-6 border-0 p-0">
          <DayField
            control={form.control}
            name="day"
            label="Discontinue from"
            required
            triggerClassName="w-full sm:w-64"
            description={
              upcoming
                ? "It hasn't started yet, so it is discontinued from today."
                : "No dose is expected from this day on. A dose already recorded on it stays."
            }
            disabledDates={(date) => {
              const day = format(date, "yyyy-MM-dd");
              return upcoming ? day !== today : day > today || day < earliest;
            }}
          />
          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="discontinue-reason" required>
                  Reason
                </FormLabel>
                <FormControl>
                  <Textarea
                    id="discontinue-reason"
                    placeholder="Why is it being stopped?"
                    {...field}
                  />
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
            Discontinue
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

interface Props {
  animalId: string;
  summary: OrderSummary;
  /** What the order form offers: for Edit's start and Order again. */
  options: MedicationOrderFormOptions;
  /** Where focus goes when the menu is gone, after a discontinue or a void
   * moves the order. */
  fallbackId?: string;
}

/**
 * The row menu of a medication order: Edit and Discontinue while it may still
 * change, Void until it is voided, and Order again, which opens the order
 * form filled from it.
 */
export function MedicationOrderActions({ animalId, summary, options, fallbackId }: Props) {
  const { order, state } = summary;
  const [open, setOpen] = useState<"edit" | "discontinue" | "void" | "again" | null>(null);
  const close = (next: boolean) => {
    if (!next) setOpen(null);
  };
  // The dialogs open from a menu item that is gone by the time they close.
  const { triggerRef, returnFocus } = useEntryDialogFocus(fallbackId);
  const correctable = state !== "VOIDED" && state !== "DISCONTINUED";
  const name = `${order.itemName} order (${summary.stateText.toLowerCase()})`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`Actions for the ${name}`}
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
          {/* An order already past its end has nothing left to stop. */}
          {correctable && state !== "ENDED" && (
            <DropdownMenuItem onSelect={() => setOpen("discontinue")}>
              <CircleSlash className="mr-2 h-4 w-4" />
              Discontinue…
            </DropdownMenuItem>
          )}
          {options.inCare && (
            <DropdownMenuItem onSelect={() => setOpen("again")}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Order again
            </DropdownMenuItem>
          )}
          {state !== "VOIDED" && (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpen("void")}>
              <Ban className="mr-2 h-4 w-4" />
              Void…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <OrderFormDialog
        open={open === "edit"}
        onOpenChange={close}
        title={`Edit the ${order.itemName} order`}
        description="Correct what was recorded. Every change is kept in its history, with what it was before."
        onCloseAutoFocus={returnFocus}
      >
        {({ onFormSubmit, ref }) => (
          <MedicationOrderCorrectionForm
            order={order}
            latestIntakeDate={options.latestIntakeDate}
            onFormSubmit={onFormSubmit}
            ref={ref}
          />
        )}
      </OrderFormDialog>

      <OrderFormDialog
        open={open === "discontinue"}
        onOpenChange={close}
        title={`Discontinue the ${order.itemName} order?`}
        description="It stays on the record, with the day it stopped and why."
        onCloseAutoFocus={returnFocus}
      >
        {({ onFormSubmit, ref }) => (
          <DiscontinueForm order={order} today={options.today} onDone={onFormSubmit} ref={ref} />
        )}
      </OrderFormDialog>

      <OrderFormDialog
        open={open === "again"}
        onOpenChange={close}
        title={`Order ${order.itemName} again`}
        description={ORDER_DESCRIPTION}
        onCloseAutoFocus={returnFocus}
      >
        {({ onFormSubmit, ref }) => (
          <MedicationOrderForm
            animalId={animalId}
            options={options}
            from={order}
            onFormSubmit={onFormSubmit}
            ref={ref}
          />
        )}
      </OrderFormDialog>

      <VoidReasonDialog
        open={open === "void"}
        onOpenChange={close}
        title={`Void the ${order.itemName} order?`}
        description={
          <>
            <p>
              This is for an order that should never have been recorded, such as
              one for the wrong animal. If the course is over or was stopped,
              discontinue it instead.
            </p>
            <p>
              It stays in the list, struck through, with its doses, and none of
              its slots is expected any more. A void can&apos;t be undone: if it
              was right after all, order it again.
            </p>
          </>
        }
        confirmLabel="Void"
        onVoid={(reason) => voidMedicationOrder(order.id, { reason })}
        onCloseAutoFocus={returnFocus}
      />
    </>
  );
}
