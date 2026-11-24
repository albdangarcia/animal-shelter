"use client";

import { useImperativeHandle, useRef, useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { updateShelterDetails } from "@/app/lib/actions/shelter-details.actions";
import {
  ShelterDetailsFormSchema,
  type ShelterDetailsFormInput,
  type ShelterDetailsFormValues,
} from "@/app/lib/zod-schemas/shelter-details.schemas";
import { US_STATES } from "@/app/lib/constants/us-states";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import {
  haveFormValuesChanged,
  type DirtyFormHandle,
} from "@/hooks/use-confirmed-open-change";

/** The form's handle: whether it was changed, and whether it is saving (its
 * dialog doesn't close under a save). */
export interface ShelterDetailsFormHandle extends DirtyFormHandle {
  isPending: () => boolean;
}

interface Props {
  state: string | null;
  onFormSubmit: () => void;
  ref?: React.Ref<ShelterDetailsFormHandle>;
}

/** Saves the US state the shelter is in. */
export function ShelterDetailsForm({ state, onFormSubmit, ref }: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  const form = useForm<ShelterDetailsFormInput, unknown, ShelterDetailsFormValues>({
    resolver: standardSchemaResolver(ShelterDetailsFormSchema),
    defaultValues: { state: state ?? "" },
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

  const onSubmit = (values: ShelterDetailsFormValues) => {
    startSubmitTransition(async () => {
      const result = await updateShelterDetails(values);
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
          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>State</FormLabel>
                <Select
                  name={field.name}
                  onValueChange={field.onChange}
                  value={field.value ?? ""}
                  disabled={isPending}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a state" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {US_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Shelter Details"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
