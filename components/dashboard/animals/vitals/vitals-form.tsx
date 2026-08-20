"use client";

import { useState, useTransition } from "react";
import { useForm, type DefaultValues } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { NumberInput } from "@/components/forms/number-input";
import { NumberField } from "@/components/forms/number-field";
import {
  WEIGHT_UNITS,
  WeightUnit,
  inferWeightUnit,
  toGrams,
  fromGrams,
  roundForUnit,
} from "@/app/lib/utils/weight-format";

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

  // The toggle defaults to whichever of the two WEIGHT_UNITS fits the most
  // recent known weight (e.g. a 180g kitten defaults to oz, not lb). Once the
  // person changes it, unitTouched locks it for the rest of the session — it
  // must never re-infer on re-render or because some other field changed.
  // Re-inference only runs when inferenceSource itself changes (e.g. the
  // Next.js router reuses this component across a client-side navigation to
  // a different animal's create-vitals page). Adjusted during render, per
  // React's guidance for syncing state from a changed prop, rather than in a
  // useEffect — a setState call in an effect body causes an extra render.
  const inferenceSource = vitalsLog?.weightGrams ?? previousWeightGrams;
  const [unit, setUnit] = useState<WeightUnit>(() =>
    inferWeightUnit(inferenceSource),
  );
  const [unitTouched, setUnitTouched] = useState(false);
  const [lastInferenceSource, setLastInferenceSource] = useState(inferenceSource);

  if (inferenceSource !== lastInferenceSource) {
    setLastInferenceSource(inferenceSource);
    if (!unitTouched) {
      setUnit(inferWeightUnit(inferenceSource));
    }
  }

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
            render={({ field }) => {
              const grams = field.value;
              const displayValue =
                grams == null ? null : roundForUnit(fromGrams(grams, unit), unit);

              return (
                <FormItem className="md:col-span-3">
                  <FormLabel>Weight</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <NumberInput
                        decimal
                        placeholder="0"
                        value={displayValue}
                        onChange={(value) => {
                          field.onChange(
                            value == null ? null : Math.round(toGrams(value, unit)),
                          );
                        }}
                      />
                    </FormControl>
                    <div className="flex rounded-md border overflow-hidden shrink-0">
                      {WEIGHT_UNITS.map((u) => (
                        <Button
                          key={u}
                          type="button"
                          size="sm"
                          variant={u === unit ? "default" : "ghost"}
                          className="rounded-none"
                          onClick={() => {
                            setUnit(u);
                            setUnitTouched(true);
                          }}
                        >
                          {u}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
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
          <FormField
            control={form.control}
            name="recordedAt"
            render={({ field }) => (
              <FormItem className="md:col-span-3">
                <FormLabel>Date Recorded</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date > new Date()}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
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
