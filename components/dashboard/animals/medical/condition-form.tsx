"use client";

import { useImperativeHandle, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  MedicalConditionStatus,
  MedicalConditionType,
} from "@/prisma/generated/enums";
import {
  addMedicalCondition,
  editMedicalCondition,
} from "@/app/lib/actions/medical-condition.actions";
import {
  MedicalConditionFormSchema,
  type MedicalConditionFormInput,
} from "@/app/lib/zod-schemas/medical-condition.schemas";
import {
  MEDICAL_CONDITION_STATUS_LABELS,
  MEDICAL_CONDITION_TYPE_LABELS,
} from "@/app/lib/constants/medical";
import type {
  ConditionFormChoices,
  MedicalConditionDisplay,
} from "@/app/lib/data/animals/medical-condition.data";
import { conditionSourceText } from "@/app/lib/utils/problem-list";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";
import { MedicalTextareaField, OptionalSelectField } from "./medical-form-fields";

/** The form's own state: every field as the inputs hold it. */
type ConditionFormState = {
  type: MedicalConditionType;
  name: string;
  status: MedicalConditionStatus;
  onsetDate: string | null;
  resolvedDate: string | null;
  diagnosedBy: string;
  sourceEntryId: string | null;
  characteristicId: string | null;
  notes: string;
};

/**
 * What the form does: add a row of `type`, maybe started from the test or
 * exam it was found on (with a name and onset to begin from), or correct a
 * stored row. A correction can open on another status: Resolve opens it on
 * Resolved, with today as the resolved day, and Make active on Active.
 */
export type ConditionFormMode =
  | {
      add: {
        type: MedicalConditionType;
        sourceEntryId?: string;
        name?: string;
        onsetDate?: string | null;
      };
    }
  | { edit: MedicalConditionDisplay; status?: MedicalConditionStatus };

interface Props {
  animalId: string;
  mode: ConditionFormMode;
  choices: ConditionFormChoices;
  /** The shelter's today: neither day can be after it. */
  today: CalendarDay;
  /** The submit button's text. */
  submitLabel: string;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const startingState = (
  mode: ConditionFormMode,
  today: CalendarDay,
): ConditionFormState => {
  if ("add" in mode) {
    return {
      type: mode.add.type,
      name: mode.add.name ?? "",
      status: MedicalConditionStatus.ACTIVE,
      onsetDate: mode.add.onsetDate ?? null,
      resolvedDate: null,
      diagnosedBy: "",
      sourceEntryId: mode.add.sourceEntryId ?? null,
      characteristicId: null,
      notes: "",
    };
  }
  const stored = mode.edit;
  const status = mode.status ?? stored.status;
  return {
    type: stored.type,
    name: stored.name,
    status,
    onsetDate: stored.onsetDate,
    // Resolving starts on today; any other status has no resolved day.
    resolvedDate:
      status === MedicalConditionStatus.RESOLVED
        ? (stored.resolvedDate ?? today)
        : null,
    diagnosedBy: stored.diagnosedBy ?? "",
    sourceEntryId: stored.sourceEntryId,
    characteristicId: stored.characteristicId,
    notes: stored.notes ?? "",
  };
};

/**
 * Adds a condition or an allergy to the problem list, or corrects one:
 * resolving it and making it active again are corrections of its status.
 */
export function ConditionForm({
  animalId,
  mode,
  choices,
  today,
  submitLabel,
  onFormSubmit,
  ref,
}: Props) {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();
  const stored = "edit" in mode ? mode.edit : null;

  const form = useForm<ConditionFormState>({
    // The schema reads the state as the action takes it.
    resolver: standardSchemaResolver(
      MedicalConditionFormSchema,
    ) as unknown as Resolver<ConditionFormState>,
    defaultValues: startingState(mode, today),
  });
  const status = useWatch({ control: form.control, name: "status" });
  const type = useWatch({ control: form.control, name: "type" });

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () =>
        haveFormValuesChanged(form.getValues(), initialValuesRef.current),
    }),
    [form],
  );

  // A correction keeps a source voided since and a trait retired since: the
  // service checks only what is newly picked.
  const sourceOptions = choices.sources.map((source) => ({
    value: source.id,
    label: capitalised(source.label),
  }));
  if (
    stored?.sourceEntry &&
    !sourceOptions.some((option) => option.value === stored.sourceEntry!.id)
  ) {
    sourceOptions.push({
      value: stored.sourceEntry.id,
      label: `${capitalised(conditionSourceText(stored.sourceEntry))}${
        stored.sourceEntry.voidedAt ? " (voided)" : ""
      }`,
    });
  }
  const traitOptions = choices.characteristics.map((trait) => ({
    value: trait.id,
    label: trait.name,
  }));
  if (
    stored?.characteristicId &&
    stored.characteristic &&
    !traitOptions.some((option) => option.value === stored.characteristicId)
  ) {
    traitOptions.push({
      value: stored.characteristicId,
      label: `${stored.characteristic.name} (retired)`,
    });
  }

  const afterToday = (date: Date) => format(date, "yyyy-MM-dd") > today;

  const onSubmit = (state: ConditionFormState) => {
    // The form's resolver already parsed the state; the action parses it
    // again from what is sent.
    const values = state as unknown as MedicalConditionFormInput;
    startSubmitTransition(async () => {
      const result = stored
        ? await editMedicalCondition(stored.id, values)
        : await addMedicalCondition(animalId, values);
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<ConditionFormState>);
      toast.error(result.message);
      // Refused for a reason other than the form's, most likely because
      // someone voided it first. Refreshing shows the row as it now is.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {stored && (
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel id="condition-type-label" required>
                  Type
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    aria-labelledby="condition-type-label"
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-wrap gap-4"
                  >
                    {Object.values(MedicalConditionType).map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={value} />
                        {MEDICAL_CONDITION_TYPE_LABELS[value]}
                      </label>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="condition-name" required>
                {type === MedicalConditionType.ALLERGY ? "Allergic to" : "Name"}
              </FormLabel>
              <FormControl>
                <Input
                  id="condition-name"
                  placeholder={
                    type === MedicalConditionType.ALLERGY
                      ? "Penicillin, chicken…"
                      : "Heartworm disease, ear infection…"
                  }
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel id="condition-status-label" required>
                Status
              </FormLabel>
              <FormControl>
                <RadioGroup
                  aria-labelledby="condition-status-label"
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Only a resolved row has a resolved day.
                    if (value !== MedicalConditionStatus.RESOLVED) {
                      form.setValue("resolvedDate", null);
                      form.clearErrors("resolvedDate");
                    }
                  }}
                  className="flex flex-wrap gap-4"
                >
                  {Object.values(MedicalConditionStatus).map((value) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={value} />
                      {MEDICAL_CONDITION_STATUS_LABELS[value]}
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <DayField
            control={form.control}
            name="onsetDate"
            label="Onset date"
            triggerClassName="w-full"
            disabledDates={afterToday}
          />
          {status === MedicalConditionStatus.RESOLVED && (
            <DayField
              control={form.control}
              name="resolvedDate"
              label="Resolved date"
              required
              triggerClassName="w-full"
              disabledDates={afterToday}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="diagnosedBy"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="condition-diagnosed-by">Diagnosed by</FormLabel>
              <FormControl>
                <Input id="condition-diagnosed-by" placeholder="Dr. Patel" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <OptionalSelectField
          control={form.control}
          name="sourceEntryId"
          label="Found on"
          noneLabel="Not recorded"
          options={sourceOptions}
        />

        <OptionalSelectField
          control={form.control}
          name="characteristicId"
          label="Medical trait it stands for"
          noneLabel="None"
          options={traitOptions}
        />

        <MedicalTextareaField control={form.control} name="notes" label="Notes" />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
