"use client";

import { useImperativeHandle, useRef, useTransition } from "react";
import { useForm } from "react-hook-form";
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
import { updateDoseTimes } from "@/app/lib/actions/dose-times.actions";
import {
  DoseTimesFormSchema,
  type DoseTimesFormInput,
  type DoseTimesFormValues,
} from "@/app/lib/zod-schemas/dose-times.schemas";
import { DOSE_SLOT_LABELS, DOSE_SLOT_ORDER } from "@/app/lib/constants/medical";
import type { DoseSlotEnds } from "@/app/lib/utils/medication-slots";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import {
  haveFormValuesChanged,
  type DirtyFormHandle,
} from "@/hooks/use-confirmed-open-change";

/** The form's handle: whether it was changed, and whether it is saving (its
 * dialog doesn't close under a save). */
export interface DoseTimesFormHandle extends DirtyFormHandle {
  isPending: () => boolean;
}

interface Props {
  ends: DoseSlotEnds;
  onFormSubmit: () => void;
  ref?: React.Ref<DoseTimesFormHandle>;
}

/** Saves the three times the dose slots end at. */
export function DoseTimesForm({ ends, onFormSubmit, ref }: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  const form = useForm<DoseTimesFormInput, unknown, DoseTimesFormValues>({
    resolver: standardSchemaResolver(DoseTimesFormSchema),
    defaultValues: { ...ends },
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

  const onSubmit = (values: DoseTimesFormValues) => {
    startSubmitTransition(async () => {
      const result = await updateDoseTimes(values);
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Nothing changes while a save is out: the dialog closes when it
            succeeds, so an edit made meanwhile would be lost unsaved. */}
        <fieldset disabled={isPending} className="m-0 min-w-0 border-0 p-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {DOSE_SLOT_ORDER.map((slot) => (
              <FormField
                key={slot}
                control={form.control}
                name={slot}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor={`dose-end-${slot}`} required>
                      {DOSE_SLOT_LABELS[slot]} doses end at
                    </FormLabel>
                    <FormControl>
                      <Input id={`dose-end-${slot}`} type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </fieldset>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Dose Times"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
