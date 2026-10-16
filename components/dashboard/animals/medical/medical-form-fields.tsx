"use client";

import {
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DayField } from "@/components/forms/day-field";
import {
  DoseUnit,
  MedicalEntrySource,
  MedicalRoute,
} from "@/prisma/generated/enums";
import {
  DOSE_UNIT_LABELS,
  MEDICAL_ENTRY_SOURCE_LABELS,
  MEDICAL_ROUTE_LABELS,
} from "@/app/lib/constants/medical";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

// Fields the medical entry forms share: recording one entry, and recording
// one for several animals at once.

/** A select's value for "nothing chosen", since an empty value can't be an
 * option. */
export const NONE = "none";

export function MedicalTextField<TValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
}: {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  placeholder?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={name}>{label}</FormLabel>
          <FormControl>
            <Input id={name} placeholder={placeholder} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Free text over several lines. */
export function MedicalTextareaField<TValues extends FieldValues>({
  control,
  name,
  label,
}: {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="md:col-span-2">
          <FormLabel htmlFor={name}>{label}</FormLabel>
          <FormControl>
            <Textarea id={name} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** What every form recording care given holds about how and when. */
// A type, not an interface, so a form's state built on it is still a plain
// record of values.
export type GivenCareState = {
  completedDate: string | null;
  /** The form's own: only care given before intake can have an unknown
   * day. */
  dateUnknown: boolean;
  source: MedicalEntrySource;
  vetPartnerId: string | null;
  vetName: string;
};

/**
 * How and when care was given: in house, by an outside vet (with the clinic
 * or the vet's name) or before intake (maybe on an unknown day), and the day.
 * Picking a source clears what it hides: care in the shelter has no outside
 * vet, and only care before intake has an unknown day.
 */
export function GivenCareFields<TValues extends GivenCareState>({
  form,
  sources,
  vetClinics,
  today,
  onSourceChange,
}: {
  form: UseFormReturn<TValues>;
  /** The sources offered: care scheduled during the stay can't be from
   * before intake. */
  sources: MedicalEntrySource[];
  vetClinics: { id: string; name: string }[];
  /** The shelter's today: the day given can't be after it. */
  today: CalendarDay;
  /** Told after a source is picked, so the form can clear its own fields. */
  onSourceChange?: (source: MedicalEntrySource) => void;
}) {
  // The shared fields, whatever else the form holds.
  const given = form as unknown as UseFormReturn<GivenCareState>;
  const [source, dateUnknown] = useWatch({
    control: given.control,
    name: ["source", "dateUnknown"],
  });

  const pickSource = (next: MedicalEntrySource) => {
    given.setValue("source", next);
    if (next === MedicalEntrySource.IN_HOUSE) {
      given.setValue("vetPartnerId", null);
      given.setValue("vetName", "");
    }
    if (next !== MedicalEntrySource.BEFORE_INTAKE && given.getValues("dateUnknown")) {
      given.setValue("dateUnknown", false);
      given.setValue("completedDate", today);
    }
    onSourceChange?.(next);
  };

  return (
    <>
      <FormField
        control={given.control}
        name="source"
        render={({ field }) => (
          <FormItem className="md:col-span-2">
            <FormLabel id="source-label" required>
              Given
            </FormLabel>
            <FormControl>
              <RadioGroup
                aria-labelledby="source-label"
                value={field.value}
                onValueChange={(value) => pickSource(value as MedicalEntrySource)}
                className="flex flex-wrap gap-4"
              >
                {sources.map((value) => (
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

      <div className="space-y-2">
        {dateUnknown ? (
          <FormItem>
            <FormLabel htmlFor="completedDate">Date given</FormLabel>
            <Input id="completedDate" value="Unknown" disabled />
          </FormItem>
        ) : (
          <DayField
            control={given.control}
            name="completedDate"
            label="Date given"
            required
            triggerClassName="w-full"
            disabledDates={(date) => format(date, "yyyy-MM-dd") > today}
          />
        )}
        {source === MedicalEntrySource.BEFORE_INTAKE && (
          <FormField
            control={given.control}
            name="dateUnknown"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(!!checked);
                    given.setValue("completedDate", checked ? null : today);
                  }}
                />
                Date unknown
              </label>
            )}
          />
        )}
      </div>

      {source !== MedicalEntrySource.IN_HOUSE && (
        <>
          <VetClinicField
            control={given.control}
            name="vetPartnerId"
            vetClinics={vetClinics}
          />
          <MedicalTextField
            control={given.control}
            name="vetName"
            label="Vet or clinic name"
          />
        </>
      )}
    </>
  );
}

/**
 * The vet clinics an entry can name: the active ones, and the one it already
 * names if that clinic has since been made inactive.
 */
export const vetClinicChoices = (
  vetClinics: { id: string; name: string }[],
  entry?: { vetPartnerId: string | null; vetPartner: { name: string } | null },
) =>
  entry?.vetPartnerId &&
  entry.vetPartner &&
  !vetClinics.some((clinic) => clinic.id === entry.vetPartnerId)
    ? [...vetClinics, { id: entry.vetPartnerId, name: entry.vetPartner.name }]
    : vetClinics;

/** One of a fixed list, or nothing. */
export function OptionalSelectField<TValues extends FieldValues>({
  control,
  name,
  label,
  noneLabel,
  options,
  required = false,
  disabled = false,
}: {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  noneLabel: string;
  options: { value: string; label: string }[];
  /** Marks the label required; the schema still decides. */
  required?: boolean;
  /** A disabled fieldset doesn't stop a Radix select from opening, so a
   * form saving says so here too. */
  disabled?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={name} required={required}>
            {label}
          </FormLabel>
          <Select
            onValueChange={(value) => field.onChange(value === NONE ? null : value)}
            value={field.value ?? NONE}
            name={field.name}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger className="w-full" id={name}>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NONE}>{noneLabel}</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

const routeOptions = Object.values(MedicalRoute).map((value) => ({
  value,
  label: MEDICAL_ROUTE_LABELS[value],
}));

export function MedicalRouteField<TValues extends FieldValues>({
  control,
  name,
}: {
  control: Control<TValues>;
  name: Path<TValues>;
}) {
  return (
    <OptionalSelectField
      control={control}
      name={name}
      label="Route"
      noneLabel="Not recorded"
      options={routeOptions}
    />
  );
}

const doseUnitOptions = Object.values(DoseUnit).map((value) => ({
  value,
  label: DOSE_UNIT_LABELS[value],
}));

export function DoseUnitField<TValues extends FieldValues>({
  control,
  name,
}: {
  control: Control<TValues>;
  name: Path<TValues>;
}) {
  return (
    <OptionalSelectField
      control={control}
      name={name}
      label="Unit"
      noneLabel="None"
      options={doseUnitOptions}
    />
  );
}

/** A vet clinic from the partner directory, or none. */
export function VetClinicField<TValues extends FieldValues>({
  control,
  name,
  vetClinics,
}: {
  control: Control<TValues>;
  name: Path<TValues>;
  vetClinics: { id: string; name: string }[];
}) {
  return (
    <OptionalSelectField
      control={control}
      name={name}
      label="Vet clinic"
      noneLabel="Not a partner clinic"
      options={vetClinics.map((clinic) => ({ value: clinic.id, label: clinic.name }))}
    />
  );
}
