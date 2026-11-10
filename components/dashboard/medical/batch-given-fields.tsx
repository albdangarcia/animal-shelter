"use client";

import { useEffect, useRef } from "react";
import type { FormEvent } from "react";
import {
  useWatch,
  type Path,
  type SubmitHandler,
  type UseFormReturn,
} from "react-hook-form";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DayField } from "@/components/forms/day-field";
import { NumberField } from "@/components/forms/number-field";
import {
  DoseUnit,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalRoute,
} from "@/prisma/generated/enums";
import type { MedicalBatchItem } from "@/app/lib/data/medical-catalog";
import {
  MEDICAL_ENTRY_SOURCE_LABELS,
  OUTSIDE_VET_NEEDS_VET,
} from "@/app/lib/constants/medical";
import { RABIES_MAX_MONTHS } from "@/app/lib/zod-schemas/medical-entry.schemas";
import { latestDueDate, nextDueDate } from "@/app/lib/utils/medical-days";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  DoseUnitField,
  MedicalRouteField,
  MedicalTextField,
  VetClinicField,
} from "@/components/dashboard/animals/medical/medical-form-fields";

/**
 * Both batch forms' state, flat: batch entry uses all of it, and the form
 * recording several scheduled entries uses the care-given part (it has no
 * mode, item or due day of its own). `tags` holds each animal's rabies tag,
 * keyed by whatever the form lists the animals by. `scheduleNextOn` is the
 * form's alone: the next dose is sent only when it is offered and ticked.
 */
export type BatchFormState = {
  mode: "RECORD" | "SCHEDULE";
  kind: MedicalEntryKind | "";
  itemId: string;
  dueDate: string | null;
  completedDate: string | null;
  source: MedicalEntrySource;
  vetPartnerId: string | null;
  vetName: string;
  veterinarianName: string;
  veterinarianLicenseNumber: string;
  manufacturer: string;
  lotNumber: string;
  lotExpiryDate: string | null;
  route: MedicalRoute | null;
  site: string;
  durationMonths: number | null;
  doseAmount: number | null;
  doseUnit: DoseUnit | null;
  tags: Record<string, string>;
  scheduleNextOn: boolean;
  scheduleNext: { dueDate: string | null };
  notes: string;
};

export const blankBatchForm = (today: CalendarDay): BatchFormState => ({
  mode: "RECORD",
  kind: "",
  itemId: "",
  dueDate: null,
  completedDate: today,
  source: MedicalEntrySource.IN_HOUSE,
  vetPartnerId: null,
  vetName: "",
  veterinarianName: "",
  veterinarianLicenseNumber: "",
  manufacturer: "",
  lotNumber: "",
  lotExpiryDate: null,
  route: null,
  site: "",
  durationMonths: null,
  doseAmount: null,
  doseUnit: null,
  tags: {},
  scheduleNextOn: true,
  scheduleNext: { dueDate: null },
  notes: "",
});

/** What picking an item fills in: its defaults. */
export const batchItemFills = (
  item: MedicalBatchItem | undefined,
): Pick<
  BatchFormState,
  "manufacturer" | "route" | "doseAmount" | "doseUnit" | "durationMonths" | "veterinarianName" | "veterinarianLicenseNumber"
> => ({
  veterinarianName: "",
  veterinarianLicenseNumber: "",
  manufacturer: item?.manufacturer ?? "",
  route: item?.defaultRoute ?? null,
  doseAmount: item?.defaultDoseAmount ?? null,
  doseUnit: item?.defaultDoseUnit ?? null,
  durationMonths: null,
});

/**
 * The next dose's day a form opens with: the day given plus the item's
 * interval, so the form reads unchanged until someone edits it. Null when
 * the next dose isn't offered.
 */
export const suggestedNextDay = (
  item: MedicalBatchItem | undefined,
  completedDate: string | null,
  today: CalendarDay,
): string | null =>
  offersNextDose(item) && completedDate
    ? nextDueDate(completedDate as CalendarDay, item!.repeatIntervalDays!, today)
    : null;

/**
 * Submits the batch form with no error from the last attempt left over.
 * These forms have no resolver, so a submit re-checks only the fields on the
 * page: an error filed elsewhere (the next dose as a whole, say) would stay
 * and block every later submit.
 */
export const submitBatchForm =
  (form: UseFormReturn<BatchFormState>, onSubmit: SubmitHandler<BatchFormState>) =>
  (event: FormEvent<HTMLFormElement>) => {
    form.clearErrors();
    return form.handleSubmit(onSubmit)(event);
  };

/**
 * Files the server's or the schema's field errors on the form, except the
 * one for the list of animals or entries (`listKey`), which the form shows
 * beside the list. Returns that one's message.
 */
export const applyBatchFieldErrors = (
  form: UseFormReturn<BatchFormState>,
  errors: Record<string, string[] | undefined>,
  listKey: "animals" | "entries",
): string | undefined => {
  for (const [key, messages] of Object.entries(errors)) {
    if (key === listKey || !messages?.length) continue;
    form.setError(key as Path<BatchFormState>, {
      type: "server",
      message: messages.join(", "),
    });
  }
  return errors[listKey]?.[0];
};

/**
 * Whether the form offers to schedule the next dose of `item`: it repeats
 * and can still be used for new entries. Animals that already have it
 * scheduled are skipped by the server, so that isn't asked here.
 */
export const offersNextDose = (item: MedicalBatchItem | undefined) =>
  !!item && item.repeatIntervalDays !== null && !item.retired;

/**
 * The care-given values as the batch schemas take them, for a kind: the
 * kind's own fields only, and the next dose only when offered and ticked.
 */
export const batchGivenValues = (
  state: BatchFormState,
  kind: typeof MedicalEntryKind.VACCINE | typeof MedicalEntryKind.TREATMENT,
  nextOffered: boolean,
) => ({
  kind,
  completedDate: state.completedDate ?? "",
  source: state.source,
  vetPartnerId: state.vetPartnerId,
  vetName: state.vetName,
  notes: state.notes,
  ...(kind === MedicalEntryKind.VACCINE
    ? {
        veterinarianName: state.veterinarianName,
        veterinarianLicenseNumber: state.veterinarianLicenseNumber,
        manufacturer: state.manufacturer,
        lotNumber: state.lotNumber,
        lotExpiryDate: state.lotExpiryDate,
        route: state.route,
        site: state.site,
        durationMonths: state.durationMonths,
      }
    : {
        doseAmount: state.doseAmount,
        doseUnit: state.doseUnit,
        route: state.route,
      }),
  scheduleNext:
    nextOffered && state.scheduleNextOn
      ? { dueDate: state.scheduleNext.dueDate ?? "" }
      : null,
});

// A batch is care given together at one time, never before intake.
const BATCH_SOURCES = [MedicalEntrySource.IN_HOUSE, MedicalEntrySource.OUTSIDE_VET];

interface Props {
  form: UseFormReturn<BatchFormState>;
  kind: typeof MedicalEntryKind.VACCINE | typeof MedicalEntryKind.TREATMENT;
  item: MedicalBatchItem | undefined;
  vetClinics: { id: string; name: string }[];
  today: CalendarDay;
  /** The animals a rabies vaccine needs a tag for, keyed as in `tags`. */
  tagged: { key: string; label: string }[];
  /** Say what empty notes mean, when that differs from "no notes". */
  notesPlaceholder?: string;
}

/**
 * How the care was given, the same for every animal in the batch: the day,
 * in house or by an outside vet, the lot and dose, a rabies vaccine's
 * duration and each animal's tag, the next dose, and notes.
 */
export function BatchGivenFields({
  form,
  kind,
  item,
  vetClinics,
  today,
  tagged,
  notesPlaceholder,
}: Props) {
  const [source, completedDate, scheduleNextOn] = useWatch({
    control: form.control,
    name: ["source", "completedDate", "scheduleNextOn"],
  });
  const nextOffered = offersNextDose(item);
  const interval = nextOffered ? item!.repeatIntervalDays : null;
  const latestNextDay = latestDueDate(today);

  // The next dose's day follows the day given and the item's interval until
  // someone picks a day of their own.
  const lastSuggestedDay = useRef(form.getValues("scheduleNext.dueDate"));
  const nextDayPicked = useRef(false);
  useEffect(() => {
    if (interval === null || !completedDate) return;
    if (form.getValues("scheduleNext.dueDate") !== lastSuggestedDay.current) {
      nextDayPicked.current = true;
    }
    if (nextDayPicked.current) return;
    const suggested = nextDueDate(completedDate as CalendarDay, interval, today);
    lastSuggestedDay.current = suggested;
    form.setValue("scheduleNext.dueDate", suggested);
  }, [completedDate, interval, form, today]);

  const scheduleNextError = form.formState.errors.scheduleNext?.message;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <DayField
        control={form.control}
        name="completedDate"
        label="Date given"
        required
        triggerClassName="w-full"
        disabledDates={(date) => format(date, "yyyy-MM-dd") > today}
      />

      <FormField
        control={form.control}
        name="source"
        render={({ field }) => (
          <FormItem>
            <FormLabel id="batch-source-label" required>
              Given
            </FormLabel>
            <FormControl>
              <RadioGroup
                aria-labelledby="batch-source-label"
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  // Care in the shelter has no outside vet.
                  if (value === MedicalEntrySource.IN_HOUSE) {
                    form.setValue("vetPartnerId", null);
                    form.setValue("vetName", "");
                  }
                }}
                className="flex flex-wrap gap-4"
              >
                {BATCH_SOURCES.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value={value} />
                    {MEDICAL_ENTRY_SOURCE_LABELS[value]}
                  </label>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {source === MedicalEntrySource.OUTSIDE_VET && (
        <>
          <VetClinicField
            control={form.control}
            name="vetPartnerId"
            vetClinics={vetClinics}
            onPick={(vetPartnerId) => {
              // This form has no resolver, so nothing else is checked again
              // before the next submit: a clinic settles only this error.
              if (
                vetPartnerId &&
                form.getFieldState("vetName").error?.message === OUTSIDE_VET_NEEDS_VET
              ) {
                form.clearErrors("vetName");
              }
            }}
          />
          <MedicalTextField
            control={form.control}
            name="vetName"
            label="Vet or clinic name"
          />
        </>
      )}

      {kind === MedicalEntryKind.VACCINE ? (
        <>
          <MedicalTextField
            control={form.control}
            name="manufacturer"
            label="Manufacturer"
          />
          <MedicalRouteField control={form.control} name="route" />
          <MedicalTextField control={form.control} name="lotNumber" label="Lot number" />
          <DayField
            control={form.control}
            name="lotExpiryDate"
            label="Lot expiry"
            clearable
            triggerClassName="w-full"
          />
          <MedicalTextField
            control={form.control}
            name="site"
            label="Site"
            placeholder="e.g. Right shoulder"
          />
          {item?.isRabies && (
            <>
            <MedicalTextField control={form.control} name="veterinarianName" label="Veterinarian name" />
            <MedicalTextField control={form.control} name="veterinarianLicenseNumber" label="Veterinarian license number" />
            <p className="text-sm text-muted-foreground md:col-span-2">These recorded credentials apply to every vaccine in this batch. Leave unknown facts blank.</p>
            <NumberField
              control={form.control}
              name="durationMonths"
              label="Duration (months)"
              required
              min={1}
              max={RABIES_MAX_MONTHS}
              placeholder="12 or 36"
            />
            </>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              control={form.control}
              name="doseAmount"
              label="Dose"
              decimal
              min={0}
            />
            <DoseUnitField control={form.control} name="doseUnit" />
          </div>
          <MedicalRouteField control={form.control} name="route" />
        </>
      )}

      {kind === MedicalEntryKind.VACCINE && item?.isRabies && tagged.length > 0 && (
        <fieldset className="space-y-2 md:col-span-2">
          <legend className="text-sm font-medium">Rabies tag numbers</legend>
          <p className="text-sm text-muted-foreground">
            Each animal gets its own tag. Leave one empty if it has no tag yet.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tagged.map(({ key, label }) => (
              <FormField
                key={key}
                control={form.control}
                name={`tags.${key}`}
                render={({ field }) => (
                  <FormItem className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                    <FormLabel className="truncate">{label}</FormLabel>
                    <FormControl>
                      <Input
                        aria-label={`Rabies tag for ${label}`}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            ))}
          </div>
        </fieldset>
      )}

      {nextOffered && (
        <fieldset className="space-y-3 rounded-lg border p-4 md:col-span-2">
          <legend className="sr-only">Next dose</legend>
          <FormField
            control={form.control}
            name="scheduleNextOn"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(!!checked)}
                />
                Schedule the next one
              </label>
            )}
          />
          <p className="text-sm text-muted-foreground">
            {item!.name} repeats every {interval}{" "}
            {interval === 1 ? "day" : "days"}. An animal that already has{" "}
            {item!.name} scheduled keeps that one instead.
          </p>
          {scheduleNextOn && (
            <DayField
              control={form.control}
              name="scheduleNext.dueDate"
              label="Next due date"
              required
              className="md:max-w-xs"
              triggerClassName="w-full"
              disabledDates={(date) => {
                const day = format(date, "yyyy-MM-dd");
                return day < today || day > latestNextDay;
              }}
            />
          )}
          {scheduleNextError && (
            <p className="text-sm text-destructive">{scheduleNextError}</p>
          )}
        </fieldset>
      )}

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem className="md:col-span-2">
            <FormLabel htmlFor="notes">Notes</FormLabel>
            <FormControl>
              <Textarea id="notes" placeholder={notesPlaceholder} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
