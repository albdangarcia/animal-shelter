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
import {
  ExamType,
  MedicalEntryKind,
  type SurgeryProcedure,
} from "@/prisma/generated/enums";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import { scheduleMedicalEntry } from "@/app/lib/actions/medical-entry.actions";
import {
  ScheduleMedicalEntrySchema,
  type ScheduleMedicalEntryFormInput,
} from "@/app/lib/zod-schemas/medical-entry.schemas";
import {
  ORDINARY_CARE_KINDS,
  type OrdinaryCareKind,
  EXAM_TYPE_LABELS,
  MEDICAL_ENTRY_KIND_LABELS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";
import { surgeryProcedureChoices } from "@/app/lib/utils/spay-neuter";
import { SpayNeuterHeldNote } from "./spay-neuter-held-note";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { dueDateIssue, latestDueDate } from "@/app/lib/utils/medical-days";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";

/**
 * The form's own state: no kind or day until one is picked. Care from the
 * catalog names its item, a surgery its procedure, an exam its type, and a
 * microchip none of these.
 */
type ScheduleFormState = {
  kind: OrdinaryCareKind | "";
  itemId: string;
  procedure: SurgeryProcedure | "";
  examType: ExamType | "";
  dueDate: string | null;
  notes: string;
};

interface Props {
  animalId: string;
  options: MedicalEntryFormOptions;
  /**
   * What the form starts with, when it is opened to plan one thing: a spay
   * or neuter, from an exemption due for review.
   */
  initial?: { kind: typeof MedicalEntryKind.SURGERY; procedure: SurgeryProcedure };
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

/**
 * Schedules care for a due day: what and when, and nothing about how it will
 * be given, which is recorded when it is. A chip's number is recorded then
 * too.
 */
export function ScheduleMedicalEntryForm({
  animalId,
  options,
  initial,
  onFormSubmit,
  ref,
}: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  const { today } = options;
  const latest = latestDueDate(today);
  // A spay or neuter only as the animal's sex allows, and not when one is
  // given or scheduled already.
  const { procedures, heldBy } = surgeryProcedureChoices(
    options.sex,
    options.spayNeuter,
    { scheduling: true },
  );
  const form = useForm<ScheduleFormState>({
    // The schema turns the state into what the action takes: a kind, and the
    // day as a calendar day.
    resolver: standardSchemaResolver(
      ScheduleMedicalEntrySchema,
    ) as unknown as Resolver<ScheduleFormState>,
    defaultValues: {
      kind: initial?.kind ?? "",
      itemId: "",
      // Scheduling checks the sex rule and the one already held, so a
      // procedure they no longer allow isn't filled in.
      procedure:
        initial && procedures.includes(initial.procedure) ? initial.procedure : "",
      examType: "",
      dueDate: null,
      notes: "",
    },
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

  // An item belongs to one kind, a procedure to surgery and a type to an
  // exam, so picking another kind clears them.
  const pickKind = (next: OrdinaryCareKind) => {
    form.setValue("kind", next, { shouldValidate: true });
    form.setValue("itemId", "");
    form.setValue("procedure", "");
    form.setValue("examType", "");
    form.clearErrors(["itemId", "procedure", "examType"]);
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
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="schedule-kind" required>
                  Kind
                </FormLabel>
                <Select
                  onValueChange={(value) => pickKind(value as OrdinaryCareKind)}
                  value={field.value}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="schedule-kind">
                      <SelectValue placeholder="Pick a kind" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ORDINARY_CARE_KINDS.map((value) => (
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

          {kind === MedicalEntryKind.SURGERY ? (
            <FormField
              control={form.control}
              name="procedure"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="schedule-procedure" required>
                    Procedure
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    name={field.name}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" id="schedule-procedure">
                        <SelectValue placeholder="Pick the procedure" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {procedures.map((value) => (
                        <SelectItem key={value} value={value}>
                          {SURGERY_PROCEDURE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {heldBy && (
                    <SpayNeuterHeldNote animalId={animalId} heldBy={heldBy} />
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : kind === MedicalEntryKind.EXAM ? (
            <FormField
              control={form.control}
              name="examType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="schedule-exam-type" required>
                    Exam type
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    name={field.name}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" id="schedule-exam-type">
                        <SelectValue placeholder="Pick the exam type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(ExamType).map((value) => (
                        <SelectItem key={value} value={value}>
                          {EXAM_TYPE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : kind === MedicalEntryKind.MICROCHIP ? (
            <p className="self-end pb-2 text-sm text-muted-foreground">
              The chip&apos;s number is recorded when it is implanted.
            </p>
          ) : (
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
          )}

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
