"use client";

import { useImperativeHandle, useRef, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { DayField } from "@/components/forms/day-field";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import { scheduleMedicalEntry } from "@/app/lib/actions/medical-entry.actions";
import {
  ScheduleMedicalEntrySchema,
  type ScheduleMedicalEntryFormInput,
} from "@/app/lib/zod-schemas/medical-entry.schemas";
import {
  CATALOG_ENTRY_KINDS,
  MEDICAL_ENTRY_KIND_LABELS,
} from "@/app/lib/constants/medical";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { dueDateIssue, latestDueDate } from "@/app/lib/utils/medical-days";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";

/** The form's own state: no kind or day until one is picked. */
type ScheduleFormState = {
  kind: MedicalEntryKind | "";
  itemId: string;
  dueDate: string | null;
  notes: string;
};

interface Props {
  animalId: string;
  options: MedicalEntryFormOptions;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

/**
 * Schedules a vaccine, test or treatment for a due day: what and when, and
 * nothing about how it will be given, which is recorded when it is.
 */
export function ScheduleMedicalEntryForm({
  animalId,
  options,
  onFormSubmit,
  ref,
}: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  const { today } = options;
  const latest = latestDueDate(today);
  const form = useForm<ScheduleFormState>({
    // The schema turns the state into what the action takes: a kind, and the
    // day as a calendar day.
    resolver: standardSchemaResolver(
      ScheduleMedicalEntrySchema,
    ) as unknown as Resolver<ScheduleFormState>,
    defaultValues: { kind: "", itemId: "", dueDate: null, notes: "" },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const items = options.items.filter((item) => item.kind === kind);

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () =>
        haveFormValuesChanged(form.getValues(), initialValuesRef.current),
    }),
    [form],
  );

  // An item belongs to one kind, so picking another kind clears it.
  const pickKind = (next: MedicalEntryKind) => {
    form.setValue("kind", next, { shouldValidate: true });
    form.setValue("itemId", "");
  };

  const onSubmit = (state: ScheduleFormState) => {
    // The form's resolver already parsed the state; the action parses it
    // again from what is sent.
    const values = state as unknown as ScheduleMedicalEntryFormInput;
    const issue = dueDateIssue(values.dueDate as CalendarDay, today);
    if (issue) {
      form.setError("dueDate", { type: "manual", message: issue });
      return;
    }
    startSubmitTransition(async () => {
      const result = await scheduleMedicalEntry(animalId, values);
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<ScheduleFormState>);
      toast.error(result.message);
    });
  };

  const noun = kind ? MEDICAL_ENTRY_KIND_LABELS[kind].toLowerCase() : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="schedule-kind" required>
                  Kind
                </FormLabel>
                <Select
                  onValueChange={(value) => pickKind(value as MedicalEntryKind)}
                  value={field.value}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="schedule-kind">
                      <SelectValue placeholder="Pick a kind" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {/* This form schedules by catalog item, which
                        surgeries and microchips don't have. */}
                    {CATALOG_ENTRY_KINDS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {MEDICAL_ENTRY_KIND_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="itemId"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="schedule-item" required>
                  Item
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  name={field.name}
                  disabled={!kind}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="schedule-item">
                      <SelectValue
                        placeholder={noun ? `Pick a ${noun}` : "Pick a kind first"}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {items.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                        {option.scheduledEntryIds.length > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            (already scheduled)
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {noun && items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    The catalog has no {noun} for this animal&apos;s species.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <DayField
            control={form.control}
            name="dueDate"
            label="Due date"
            required
            triggerClassName="w-full"
            disabledDates={(date) => {
              const day = format(date, "yyyy-MM-dd");
              return day < today || day > latest;
            }}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel htmlFor="schedule-notes">Notes</FormLabel>
                <FormControl>
                  <Textarea id="schedule-notes" {...field} />
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
            Schedule
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
