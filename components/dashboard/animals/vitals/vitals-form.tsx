"use client";

import { useEffect, useState, startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { INITIAL_FORM_STATE } from "@/app/lib/form-state-types";
import {
  createVitalsEntry,
  updateVitalsEntry,
  VitalsFormState,
} from "@/app/lib/actions/animal-vitals.actions";
import { AnimalVitalsFormPayload } from "@/app/lib/data/animals/animal-vitals.data";
import { VitalsFormSchema } from "@/app/lib/zod-schemas/vitals.schemas";
import {
  WEIGHT_UNITS,
  WeightUnit,
  inferWeightUnit,
  toGrams,
  fromGrams,
  roundForUnit,
} from "@/app/lib/utils/weight-format";

type VitalsFormValues = z.infer<typeof VitalsFormSchema>;

interface VitalsFormProps {
  animalId: string;
  vitalsLog?: AnimalVitalsFormPayload; // Optional: if provided, form is in "edit" mode
  previousWeightGrams: number | null;
  onFormSubmit: () => void; // To close the dialog on success
}

export function VitalsForm({
  animalId,
  vitalsLog,
  previousWeightGrams,
  onFormSubmit,
}: VitalsFormProps) {
  const isEditMode = !!vitalsLog;

  const action = isEditMode
    ? updateVitalsEntry.bind(null, vitalsLog.id, animalId)
    : createVitalsEntry.bind(null, animalId);

  const [state, formAction, isPending] = useActionState<
    VitalsFormState,
    FormData
  >(action, INITIAL_FORM_STATE);

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

  const form = useForm({
    resolver: zodResolver(VitalsFormSchema),
    defaultValues: vitalsLog
      ? {
          weightGrams: vitalsLog.weightGrams ?? "",
          temperatureC: vitalsLog.temperatureC ?? "",
          bodyConditionScore: vitalsLog.bodyConditionScore ?? "",
          recordedAt: new Date(vitalsLog.recordedAt),
          notes: vitalsLog.notes ?? "",
        }
      : {
          weightGrams: "",
          temperatureC: "",
          bodyConditionScore: "",
          recordedAt: new Date(),
          notes: "",
        },
  });

  const { setError } = form;

  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      toast.success(state.message);
      onFormSubmit(); // Close the dialog
    } else if (state.errors) {
      toast.error(state.message);
      for (const [key, value] of Object.entries(state.errors)) {
        if (value) {
          form.setError(key as keyof VitalsFormValues, {
            type: "server",
            message: value.join(", "),
          });
        }
      }
    } else {
      toast.error(state.message);
    }
  }, [state, form, setError, onFormSubmit]);

  const onSubmit = (data: VitalsFormValues) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Date) {
        formData.append(key, value.toISOString());
      } else if (value != null && value !== "") {
        formData.append(key, String(value));
      }
    }

    startTransition(() => {
      formAction(formData);
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
              const grams =
                field.value === "" || field.value == null
                  ? null
                  : Number(field.value);
              const displayValue =
                grams == null ? "" : String(roundForUnit(fromGrams(grams, unit), unit));

              return (
                <FormItem className="md:col-span-3">
                  <FormLabel>Weight</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={displayValue}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            field.onChange("");
                            return;
                          }
                          const parsed = parseFloat(raw);
                          if (Number.isNaN(parsed)) return;
                          field.onChange(Math.round(toGrams(parsed, unit)));
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
          <FormField
            control={form.control}
            name="temperatureC"
            render={({ field }) => {
              const value =
                field.value === undefined || field.value === ""
                  ? ""
                  : String(field.value);

              return (
                <FormItem className="md:col-span-3">
                  <FormLabel>Temperature (°C)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      placeholder="38.5"
                      value={value}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === "" ? "" : parseFloat(val));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {/* Body Condition Score */}
          <FormField
            control={form.control}
            name="bodyConditionScore"
            render={({ field }) => {
              const value =
                field.value === undefined || field.value === ""
                  ? ""
                  : String(field.value);

              return (
                <FormItem className="md:col-span-3">
                  <FormLabel>Body Condition Score (1-9)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={9}
                      step={1}
                      placeholder="5"
                      value={value}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === "" ? "" : parseFloat(val));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {/* Recorded At */}
          <FormField
            control={form.control}
            name="recordedAt"
            render={({ field }) => {
              const dateValue = field.value as Date | undefined;

              return (
                <FormItem className="md:col-span-3">
                  <FormLabel>Date Recorded</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !dateValue && "text-muted-foreground",
                          )}
                        >
                          {dateValue ? (
                            format(dateValue, "PPP")
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
                        selected={dateValue}
                        onSelect={field.onChange}
                        disabled={(date) => date > new Date()}
                        autoFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              );
            }}
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
