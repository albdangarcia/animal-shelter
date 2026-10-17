"use client";

import { reportCareDefaults, type ReportEntryContext } from "@/app/lib/utils/vet-visit-report";

import { useImperativeHandle, useRef, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { MedicalEntryKind, MedicalEntrySource } from "@/prisma/generated/enums";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import {
  editMedicalEntry,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
} from "@/app/lib/actions/medical-entry.actions";
import {
  MedicalEntryFormSchema,
  type MedicalEntryFormInput,
} from "@/app/lib/zod-schemas/medical-entry.schemas";
import { normaliseChipNumber } from "@/app/lib/utils/microchip";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";
import {
  GivenCareFields,
  MedicalTextField,
  MedicalTextareaField,
  vetClinicChoices,
  type GivenCareState,
} from "./medical-form-fields";
import type { ScheduledCare } from "./medical-entry-form";

type MicrochipFormState = GivenCareState & {
  kind: typeof MedicalEntryKind.MICROCHIP;
  chipNumber: string;
  brand: string;
  notes: string;
};

const fromEntry = (entry: MedicalEntryDisplay): MicrochipFormState => ({
  kind: MedicalEntryKind.MICROCHIP,
  chipNumber: entry.chipNumber ?? "",
  brand: entry.microchip?.brand ?? "",
  completedDate: entry.completedDate,
  dateUnknown: entry.completedDate === null,
  // Only completed entries are edited, and every one has a source; the
  // fallback is the record form's default.
  source: entry.source ?? MedicalEntrySource.IN_HOUSE,
  vetPartnerId: entry.vetPartnerId,
  vetName: entry.vetName ?? "",
  notes: entry.notes ?? "",
});

interface Props {
  report?: ReportEntryContext;
  animalId: string;
  options: MedicalEntryFormOptions;
  /** Present when editing. */
  entry?: MedicalEntryDisplay;
  /** Present when recording a scheduled chip as implanted. */
  scheduled?: ScheduledCare;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

/**
 * Records a microchip: its number and brand, and how and when it came to be
 * in the animal (implanted here, by an outside vet, or found on a scan before
 * intake). Also edits one, and records a scheduled one as implanted.
 */
export function MicrochipEntryForm({
  animalId,
  options,
  entry,
  scheduled,
  report,
  onFormSubmit,
  ref,
}: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  const vetClinics = vetClinicChoices(options.vetClinics, entry);

  const form = useForm<MicrochipFormState>({
    // The schema reads the state as a microchip, checks the number in its
    // stored form, and drops `dateUnknown`.
    resolver: standardSchemaResolver(
      MedicalEntryFormSchema,
    ) as unknown as Resolver<MicrochipFormState>,
    defaultValues: entry
      ? fromEntry(entry)
      : {
          kind: MedicalEntryKind.MICROCHIP,
          chipNumber: "",
          brand: "",
          completedDate: options.today,
          dateUnknown: false,
          source: MedicalEntrySource.IN_HOUSE,
          vetPartnerId: null,
          vetName: "",
          notes: scheduled?.notes ?? "",
          ...reportCareDefaults(report),
        },
  });

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isPending: () => isPending,
      isDirty: () =>
        haveFormValuesChanged(form.getValues(), initialValuesRef.current),
    }),
    [form, isPending],
  );

  const onSubmit = (state: MicrochipFormState) => {
    const values = state as unknown as MedicalEntryFormInput;
    startSubmitTransition(async () => {
      const result = entry
        ? await editMedicalEntry(entry.id, values)
        : scheduled
          ? await recordScheduledMedicalEntry(scheduled.id, values, report?.id)
          : await recordMedicalEntry(animalId, values, report?.id);
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<MicrochipFormState>);
      toast.error(result.message);
    });
  };

  // A chip scheduled during the stay was implanted then, never before intake.
  const sources = Object.values(MedicalEntrySource).filter(
    (value) => !scheduled || value !== MedicalEntrySource.BEFORE_INTAKE,
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="chipNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="chipNumber" required>
                  Chip number
                </FormLabel>
                <FormControl>
                  <Input
                    id="chipNumber"
                    className="font-mono"
                    autoComplete="off"
                    {...field}
                    // Shown as it is stored: no spaces or hyphens, upper
                    // case.
                    onBlur={() => {
                      field.onChange(normaliseChipNumber(field.value));
                      field.onBlur();
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <MedicalTextField
            control={form.control}
            name="brand"
            label="Brand"
            placeholder="e.g. HomeAgain"
          />

          <GivenCareFields
            form={form}
            sources={sources}
            vetClinics={vetClinics}
            today={options.today}
          />

          <MedicalTextareaField control={form.control} name="notes" label="Notes" />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {entry ? "Save Changes" : "Record Microchip"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
