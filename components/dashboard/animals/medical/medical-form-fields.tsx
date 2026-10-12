"use client";

import type { Control, FieldValues, Path } from "react-hook-form";
import { Input } from "@/components/ui/input";
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
import { DoseUnit, MedicalRoute } from "@/prisma/generated/enums";
import {
  DOSE_UNIT_LABELS,
  MEDICAL_ROUTE_LABELS,
} from "@/app/lib/constants/medical";

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

/** One of a fixed list, or nothing. */
function OptionalSelectField<TValues extends FieldValues>({
  control,
  name,
  label,
  noneLabel,
  options,
}: {
  control: Control<TValues>;
  name: Path<TValues>;
  label: string;
  noneLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={name}>{label}</FormLabel>
          <Select
            onValueChange={(value) => field.onChange(value === NONE ? null : value)}
            value={field.value ?? NONE}
            name={field.name}
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
