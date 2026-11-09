"use client";

import { useEffect, useImperativeHandle, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver, type UseFormReturn } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { DayField } from "@/components/forms/day-field";
import { NumberField } from "@/components/forms/number-field";
import {
  DoseUnit,
  MedicalRoute,
  MedicationFrequency,
  type DoseSlot,
} from "@/prisma/generated/enums";
import {
  createMedicationOrder,
  editMedicationOrder,
} from "@/app/lib/actions/medication.actions";
import {
  MedicationOrderCorrectionSchema,
  MedicationOrderFormSchema,
  type MedicationOrderCorrectionInput,
  type MedicationOrderFormInput,
} from "@/app/lib/zod-schemas/medication.schemas";
import {
  DOSE_SLOT_LABELS,
  DOSE_UNIT_LABELS,
  MEDICAL_ROUTE_LABELS,
  MEDICATION_FREQUENCY_LABELS,
} from "@/app/lib/constants/medical";
import { slotsFor } from "@/app/lib/utils/medication-slots";
import {
  calendarDay,
  shelterDaysBetweenKeys,
  shiftDayKey,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { FieldErrors } from "@/app/lib/action-result";
import type {
  AnimalMedicationOrder,
  MedicationOrderFormOptions,
} from "@/app/lib/data/animals/medication.data";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";
import { MedicalTextareaField, MedicalTextField, NONE } from "./medical-form-fields";

/** A form's handle: whether it was changed, and whether it is saving (a
 * dialog doesn't close under a save). */
export interface MedicationOrderFormHandle extends DirtyFormHandle {
  isPending: () => boolean;
}

const frequencies = Object.values(MedicationFrequency);

/** One of a fixed list, required: the medication, unit, route, frequency
 * and first dose. Disabled while saving: a disabled fieldset doesn't stop a
 * Radix select from opening. */
function ChoiceField<TValues extends Record<string, unknown>>({
  form,
  name,
  label,
  placeholder,
  options,
  disabled,
  description,
  onPick,
}: {
  form: UseFormReturn<TValues>;
  name: keyof TValues & string;
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  description?: string;
  onPick?: (value: string) => void;
}) {
  return (
    <FormField
      control={form.control as never}
      name={name as never}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={name} required>
            {label}
          </FormLabel>
          <Select
            value={(field.value as string | null) || NONE}
            onValueChange={(value) => {
              field.onChange(value === NONE ? null : value);
              if (value !== NONE) onPick?.(value);
            }}
            name={field.name}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger className="w-full" id={name}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NONE} disabled>
                {placeholder}
              </SelectItem>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

const slotOptions = (frequency: MedicationFrequency | null) =>
  (frequency ? slotsFor(frequency) : []).map((slot) => ({
    value: slot,
    label: DOSE_SLOT_LABELS[slot],
  }));

/** The day before which no day can be picked as the start. */
const beforeDay = (limit: CalendarDay | null) => (date: Date) =>
  limit !== null && format(date, "yyyy-MM-dd") < limit;

/** "For N days" from an end day: the days from the start through it. */
const daysFor = (startDate: string | null, endDate: string | null) =>
  startDate && endDate && endDate >= startDate
    ? shelterDaysBetweenKeys(calendarDay(startDate), calendarDay(endDate)) + 1
    : null;

/** The end day "for N days" gives: the start and the N − 1 days after it. */
const endFor = (startDate: string | null, days: number | null) =>
  startDate && days !== null && Number.isInteger(days) && days >= 1
    ? shiftDayKey(calendarDay(startDate), days - 1)
    : null;

/** The order form's own state: every field as the inputs hold it. "For N
 * days" is the form's own, and sets the end day. */
type OrderFormState = {
  itemId: string;
  doseAmount: number | null;
  doseUnit: DoseUnit | null;
  route: MedicalRoute | null;
  frequency: MedicationFrequency | null;
  intervalDays: number | null;
  startDate: string | null;
  firstSlot: DoseSlot | null;
  endDate: string | null;
  forDays: number | null;
  instructions: string;
  prescribedBy: string;
};

/**
 * The start and end fields every order form holds: the start day and the
 * first dose on it, and the end day, or "for N days" from the start. The two
 * ends follow each other as either is typed or picked; a new start keeps the
 * number of days.
 */
function DaysFields<
  TValues extends Pick<OrderFormState, "startDate" | "firstSlot" | "endDate" | "forDays">,
>({
  form,
  frequency,
  latestIntakeDate,
  startLocked,
  onStartChange,
  isPending,
}: {
  form: UseFormReturn<TValues>;
  frequency: MedicationFrequency | null;
  latestIntakeDate: CalendarDay | null;
  /** Once a dose is recorded the start and first dose can't change. */
  startLocked: boolean;
  /** Told when the start day is picked by hand. */
  onStartChange?: (startDate: string | null) => void;
  isPending: boolean;
}) {
  const days = form as unknown as UseFormReturn<OrderFormState>;
  const [startDate, firstSlot] = useWatch({
    control: days.control,
    name: ["startDate", "firstSlot"],
  });
  const slots = slotOptions(frequency);
  const startChanged = useRef(onStartChange);
  useEffect(() => {
    startChanged.current = onStartChange;
  });

  useEffect(() => {
    // Only what a person typed or picked: the values set here aren't.
    const { unsubscribe } = days.watch((values, { name, type }) => {
      if (type !== "change") return;
      if (name === "startDate") {
        if (values.forDays != null) {
          days.setValue("endDate", endFor(values.startDate ?? null, values.forDays));
        }
        startChanged.current?.(values.startDate ?? null);
      } else if (name === "endDate") {
        days.setValue("forDays", daysFor(values.startDate ?? null, values.endDate ?? null));
      } else if (name === "forDays") {
        days.setValue("endDate", endFor(values.startDate ?? null, values.forDays ?? null));
      }
    });
    return unsubscribe;
  }, [days]);

  return (
    <>
      {startLocked ? (
        <FormItem>
          <FormLabel htmlFor="startDate">Start date</FormLabel>
          <Input id="startDate" value={startDate ?? ""} disabled readOnly />
        </FormItem>
      ) : (
        <DayField
          control={days.control}
          name="startDate"
          label="Start date"
          required
          triggerClassName="w-full"
          disabledDates={beforeDay(latestIntakeDate)}
        />
      )}
      {slots.length > 0 &&
        (startLocked ? (
          <FormItem>
            <FormLabel htmlFor="firstSlot">First dose</FormLabel>
            <Input
              id="firstSlot"
              value={firstSlot ? DOSE_SLOT_LABELS[firstSlot] : ""}
              disabled
              readOnly
            />
            <FormDescription>
              A dose is recorded, so the start can&apos;t change. Discontinue the
              order and order it again instead.
            </FormDescription>
          </FormItem>
        ) : (
          <ChoiceField
            form={days}
            name="firstSlot"
            label="First dose"
            placeholder="Pick a slot"
            options={slots}
            disabled={isPending}
            description="The start day's earlier slots aren't expected."
          />
        ))}
      <DayField
        control={days.control}
        name="endDate"
        label="End date"
        triggerClassName="w-full"
        description="Leave it empty to give it until it is discontinued."
        disabledDates={beforeDay((startDate as CalendarDay | null) ?? null)}
      />
      <NumberField
        control={days.control}
        name="forDays"
        label="For how many days"
        min={1}
      />
    </>
  );
}

interface OrderProps {
  animalId: string;
  options: MedicationOrderFormOptions;
  /** An order to order again: its medication, dose and how often, and as many
   * days from a new start. */
  from?: AnimalMedicationOrder | null;
  onFormSubmit: () => void;
  ref?: React.Ref<MedicationOrderFormHandle>;
}

const prefilled = (
  options: MedicationOrderFormOptions,
  from: AnimalMedicationOrder | null | undefined,
): OrderFormState => {
  if (!from) {
    return {
      itemId: "",
      doseAmount: null,
      doseUnit: null,
      route: null,
      frequency: null,
      intervalDays: null,
      startDate: options.today,
      firstSlot: null,
      endDate: null,
      forDays: null,
      instructions: "",
      prescribedBy: "",
    };
  }
  const start = options.defaultStarts[from.frequency];
  const forDays = daysFor(from.startDate, from.endDate);
  return {
    // A medication retired, or narrowed to other species, since is picked
    // again.
    itemId: options.medications.some((item) => item.id === from.itemId) ? from.itemId : "",
    doseAmount: from.doseAmount,
    doseUnit: from.doseUnit,
    route: from.route,
    frequency: from.frequency,
    intervalDays: from.intervalDays,
    startDate: start.startDate,
    firstSlot: start.firstSlot,
    endDate: endFor(start.startDate, forDays),
    forDays,
    instructions: from.instructions ?? "",
    prescribedBy: from.prescribedBy ?? "",
  };
};

/**
 * Orders a medication: what, how much, how, how often, from when and for how
 * long. Picking the medication fills in its default dose, unit and route; the
 * start defaults to today at the frequency's first slot whose window hasn't
 * ended (tomorrow when none is left), as the server works it out.
 */
export function MedicationOrderForm({ animalId, options, from, onFormSubmit, ref }: OrderProps) {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();
  const form = useForm<OrderFormState>({
    // The schema reads the state as the action takes it.
    resolver: standardSchemaResolver(
      MedicationOrderFormSchema,
    ) as unknown as Resolver<OrderFormState>,
    defaultValues: prefilled(options, from),
  });
  const frequency = useWatch({ control: form.control, name: "frequency" });
  // Until the start is picked by hand, it follows the frequency's default.
  const startPicked = useRef(false);

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => haveFormValuesChanged(form.getValues(), initialValuesRef.current),
      isPending: () => isPending,
    }),
    [form, isPending],
  );

  const pickMedication = (itemId: string) => {
    const item = options.medications.find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (item.defaultDoseAmount !== null) form.setValue("doseAmount", item.defaultDoseAmount);
    if (item.defaultDoseUnit) form.setValue("doseUnit", item.defaultDoseUnit);
    if (item.defaultRoute) form.setValue("route", item.defaultRoute);
  };

  const firstSlotOn = (next: MedicationFrequency, startDate: string | null) => {
    const start = options.defaultStarts[next];
    return startDate === start.startDate ? start.firstSlot : (slotsFor(next)[0] ?? null);
  };

  const pickFrequency = (value: string) => {
    const next = value as MedicationFrequency;
    if (!startPicked.current) {
      form.setValue("startDate", options.defaultStarts[next].startDate);
      const forDays = form.getValues("forDays");
      if (forDays !== null) {
        form.setValue("endDate", endFor(options.defaultStarts[next].startDate, forDays));
      }
    }
    form.setValue("firstSlot", firstSlotOn(next, form.getValues("startDate")));
    if (next !== MedicationFrequency.EVERY_N_DAYS) {
      form.setValue("intervalDays", null);
      form.clearErrors("intervalDays");
    }
    form.clearErrors("firstSlot");
  };

  const onSubmit = ({ forDays: _forDays, ...state }: OrderFormState) => {
    // The form's resolver already parsed the state; the action parses it
    // again from what is sent.
    const values = state as unknown as MedicationOrderFormInput;
    startSubmitTransition(async () => {
      const result = await createMedicationOrder(animalId, values);
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<OrderFormState>);
      toast.error(result.message);
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={isPending} className="m-0 min-w-0 border-0 p-0">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <ChoiceField
                form={form}
                name="itemId"
                label="Medication"
                placeholder={
                  options.medications.length > 0
                    ? "Pick a medication"
                    : "No medication in the catalog for this species"
                }
                options={options.medications.map((item) => ({
                  value: item.id,
                  label: item.manufacturer ? `${item.name} (${item.manufacturer})` : item.name,
                }))}
                disabled={isPending}
                onPick={pickMedication}
              />
            </div>
            <NumberField
              control={form.control}
              name="doseAmount"
              label="Dose"
              required
              min={0}
              decimal
            />
            <ChoiceField
              form={form}
              name="doseUnit"
              label="Unit"
              placeholder="Pick a unit"
              options={Object.values(DoseUnit).map((value) => ({
                value,
                label: DOSE_UNIT_LABELS[value],
              }))}
              disabled={isPending}
            />
            <ChoiceField
              form={form}
              name="route"
              label="Route"
              placeholder="Pick a route"
              options={Object.values(MedicalRoute).map((value) => ({
                value,
                label: MEDICAL_ROUTE_LABELS[value],
              }))}
              disabled={isPending}
            />
            <ChoiceField
              form={form}
              name="frequency"
              label="How often"
              placeholder="Pick how often"
              options={frequencies.map((value) => ({
                value,
                label: MEDICATION_FREQUENCY_LABELS[value],
              }))}
              disabled={isPending}
              onPick={pickFrequency}
            />
            {frequency === MedicationFrequency.EVERY_N_DAYS && (
              <NumberField
                control={form.control}
                name="intervalDays"
                label="Every how many days"
                required
                min={2}
                max={31}
              />
            )}
            <DaysFields
              form={form}
              frequency={frequency}
              latestIntakeDate={options.latestIntakeDate}
              startLocked={false}
              isPending={isPending}
              onStartChange={(startDate) => {
                startPicked.current = true;
                if (frequency) form.setValue("firstSlot", firstSlotOn(frequency, startDate));
              }}
            />
            <MedicalTextField
              control={form.control}
              name="prescribedBy"
              label="Prescribed by"
              placeholder="The vet or clinic"
            />
            <MedicalTextareaField
              control={form.control}
              name="instructions"
              label="Instructions"
            />
          </div>
        </fieldset>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Order Medication
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

type CorrectionFormState = Pick<
  OrderFormState,
  "startDate" | "firstSlot" | "endDate" | "forDays" | "instructions" | "prescribedBy"
> & { frequency: MedicationFrequency };

interface CorrectionProps {
  order: AnimalMedicationOrder;
  latestIntakeDate: CalendarDay | null;
  onFormSubmit: () => void;
  ref?: React.Ref<MedicationOrderFormHandle>;
}

/**
 * Corrects an order: its end day, prescriber and instructions, and its start
 * day and first dose while no dose is recorded. The medication, dose and how
 * often never change: those are a new order.
 */
export function MedicationOrderCorrectionForm({
  order,
  latestIntakeDate,
  onFormSubmit,
  ref,
}: CorrectionProps) {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();
  const startLocked = order.doses.some((dose) => !dose.voided);
  const form = useForm<CorrectionFormState>({
    resolver: standardSchemaResolver(
      MedicationOrderCorrectionSchema,
    ) as unknown as Resolver<CorrectionFormState>,
    defaultValues: {
      frequency: order.frequency,
      startDate: order.startDate,
      firstSlot: order.firstSlot,
      endDate: order.endDate,
      forDays: daysFor(order.startDate, order.endDate),
      instructions: order.instructions ?? "",
      prescribedBy: order.prescribedBy ?? "",
    },
  });

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => haveFormValuesChanged(form.getValues(), initialValuesRef.current),
      isPending: () => isPending,
    }),
    [form, isPending],
  );

  const onSubmit = ({ forDays: _forDays, ...state }: CorrectionFormState) => {
    const values = state as unknown as MedicationOrderCorrectionInput;
    startSubmitTransition(async () => {
      const result = await editMedicationOrder(order.id, values);
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<CorrectionFormState>);
      toast.error(result.message);
      // Refused for a reason other than the form's, most likely because
      // someone discontinued or voided it first.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={isPending} className="m-0 min-w-0 border-0 p-0">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <DaysFields
              form={form}
              frequency={order.frequency}
              // A correction keeps an order from an earlier stay; the server
              // checks a moved start against the latest intake.
              latestIntakeDate={latestIntakeDate}
              startLocked={startLocked}
              isPending={isPending}
              onStartChange={(startDate) => {
                const slots = slotsFor(order.frequency);
                if (startDate !== order.startDate && slots.length > 0) {
                  form.setValue("firstSlot", form.getValues("firstSlot") ?? slots[0]);
                }
              }}
            />
            <MedicalTextField
              control={form.control}
              name="prescribedBy"
              label="Prescribed by"
              placeholder="The vet or clinic"
            />
            <MedicalTextareaField
              control={form.control}
              name="instructions"
              label="Instructions"
            />
          </div>
        </fieldset>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
