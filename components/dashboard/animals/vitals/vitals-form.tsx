"use client";

import { useTransition } from "react";
import { useForm, type DefaultValues } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DateField } from "@/components/forms/date-field";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import {
  createVitalsEntry,
  updateVitalsEntry,
} from "@/app/lib/actions/animal-vitals.actions";
import { AnimalVitalsFormPayload } from "@/app/lib/data/animals/animal-vitals.data";
import {
  VitalsFormSchema,
  type VitalsFormValues,
} from "@/app/lib/zod-schemas/vitals.schemas";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { NumberField } from "@/components/forms/number-field";
import { WeightInput } from "@/components/forms/weight-input";

interface VitalsFormProps {
  animalId: string;
  vitalsLog?: AnimalVitalsFormPayload; // Optional: if provided, form is in "edit" mode
  previousWeightGrams: number | null;
  onFormSubmit: () => void; // To close the dialog on success
}

const buildDefaultValues = (
  vitalsLog?: AnimalVitalsFormPayload,
): DefaultValues<VitalsFormValues> => ({
  weightGrams: vitalsLog?.weightGrams ?? null,
  temperatureC: vitalsLog?.temperatureC ?? null,
  bodyConditionScore: vitalsLog?.bodyConditionScore ?? null,
  recordedAt: vitalsLog ? new Date(vitalsLog.recordedAt) : new Date(),
  notes: vitalsLog?.notes ?? "",
});

export function VitalsForm({
  animalId,
  vitalsLog,
  previousWeightGrams,
  onFormSubmit,
}: VitalsFormProps) {
  const isEditMode = !!vitalsLog;

  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<VitalsFormValues>({
    resolver: standardSchemaResolver(VitalsFormSchema),
    defaultValues: buildDefaultValues(vitalsLog),
  });

  const onSubmit = (values: VitalsFormValues) => {
    startSubmitTransition(async () => {
      const result = isEditMode
        ? await updateVitalsEntry(vitalsLog.id, animalId, values)
        : await createVitalsEntry(animalId, values);

      if (result.ok) {
        toast.success(result.message);
        onFormSubmit(); // Close the dialog
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Weight */}
          <FormField
            control={form.control}
            name="weightGrams"
            render={({ field }) => (
              <FormItem className="md:col-span-3">
                <FormLabel>Weight</FormLabel>
                <FormControl>
                  <WeightInput
                    placeholder="0"
                    value={field.value}
                    onChange={field.onChange}
                    inferFrom={previousWeightGrams}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Temperature */}
          <NumberField
            control={form.control}
            name="temperatureC"
            label="Temperature (°C)"
            className="md:col-span-3"
            decimal
            placeholder="38.5"
          />

          {/* Body Condition Score */}
          <NumberField
            control={form.control}
            name="bodyConditionScore"
            label="Body Condition Score (1-9)"
            className="md:col-span-3"
            min={1}
            max={9}
            placeholder="5"
          />

          {/* Recorded At */}
          <DateField
            control={form.control}
            name="recordedAt"
            label="Date Recorded"
            className="md:col-span-3"
            triggerClassName="w-full pl-3"
            disabledDates={(date) => date > new Date()}
          />

          {/* Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="col-span-full">
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Anything else worth recording..."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending
              ? isEditMode
                ? "Updating..."
                : "Recording..."
              : isEditMode
                ? "Update Vitals"
                : "Record Vitals"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
