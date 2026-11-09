"use client";

import { useImperativeHandle, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  SpayNeuterExemptionReason,
  SurgeryProcedure,
  type Sex,
} from "@/prisma/generated/enums";
import {
  declineMedicalEntry,
  recordSpayNeuterExemption,
} from "@/app/lib/actions/medical-entry.actions";
import {
  RecordSpayNeuterExemptionSchema,
  SpayNeuterExemptionTermsSchema,
  type RecordSpayNeuterExemptionFormInput,
} from "@/app/lib/zod-schemas/medical-entry.schemas";
import {
  SPAY_NEUTER_EXEMPTION_REASON_LABELS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";
import { procedureSexIssue } from "@/app/lib/utils/spay-neuter";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { dueDateIssue, latestDueDate } from "@/app/lib/utils/medical-days";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";

/**
 * The form's own state: no reason until one is picked, and the note in words
 * as `declineReason`, whichever action it goes to.
 */
type ExemptionFormState = {
  procedure: SurgeryProcedure | "";
  exemptionReason: SpayNeuterExemptionReason | "";
  declineReason: string;
  reviewDate: string | null;
};

/**
 * What the form does: record an exemption on its own, for an animal of
 * `sex` (maybe starting from an earlier exemption's procedure and reason),
 * or decline the scheduled spay or neuter `entryId`, whose procedure is
 * already set.
 */
export type ExemptionFormMode =
  | {
      record: {
        sex: Sex;
        procedure?: SurgeryProcedure;
        exemptionReason?: SpayNeuterExemptionReason;
      };
    }
  | { decline: { entryId: string } };

interface Props {
  animalId: string;
  mode: ExemptionFormMode;
  /** The shelter's today: the review day can't be before it. */
  today: CalendarDay;
  /** The submit button's text. */
  submitLabel: string;
  /**
   * Whether the exemption can have a review day. Not once the animal has
   * left the shelter's care: nothing reviews it then.
   */
  reviewable?: boolean;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

const SPAY_NEUTER: SurgeryProcedure[] = [
  SurgeryProcedure.SPAY,
  SurgeryProcedure.NEUTER,
];

/**
 * Records that an animal is exempt from a spay or neuter: which one, why
 * (with words for Other), and maybe the day to look at it again. Left
 * without a review day, the exemption holds until it is voided.
 */
export function SpayNeuterExemptionForm({
  animalId,
  mode,
  today,
  submitLabel,
  reviewable = true,
  onFormSubmit,
  ref,
}: Props) {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();
  const latest = latestDueDate(today);
  const record = "record" in mode ? mode.record : null;
  // A spay or a neuter, as the animal's sex allows. Recording checks the sex
  // rule, so an earlier exemption's procedure that the sex no longer allows
  // (it was corrected since) isn't filled in.
  const procedures = record
    ? SPAY_NEUTER.filter((value) => !procedureSexIssue(value, record.sex))
    : [];
  const startingProcedure =
    record?.procedure && procedures.includes(record.procedure)
      ? record.procedure
      : procedures.length === 1
        ? procedures[0]
        : "";

  const form = useForm<ExemptionFormState>({
    // The schema reads the state as the action takes it, and drops what that
    // action doesn't use.
    resolver: standardSchemaResolver(
      record ? RecordSpayNeuterExemptionSchema : SpayNeuterExemptionTermsSchema,
    ) as unknown as Resolver<ExemptionFormState>,
    defaultValues: {
      procedure: startingProcedure,
      exemptionReason: record?.exemptionReason ?? "",
      declineReason: "",
      reviewDate: null,
    },
  });
  const exemptionReason = useWatch({
    control: form.control,
    name: "exemptionReason",
  });

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () =>
        haveFormValuesChanged(form.getValues(), initialValuesRef.current),
    }),
    [form],
  );

  const onSubmit = (state: ExemptionFormState) => {
    // The form's resolver already parsed the state; the action parses it
    // again from what is sent.
    const values = state as unknown as RecordSpayNeuterExemptionFormInput;
    const issue =
      values.reviewDate &&
      dueDateIssue(values.reviewDate as CalendarDay, today, "The review date");
    if (issue) {
      form.setError("reviewDate", { type: "manual", message: issue });
      return;
    }
    startSubmitTransition(async () => {
      if (record) {
        const result = await recordSpayNeuterExemption(animalId, values);
        if (result.ok) {
          toast.success(result.message);
          onFormSubmit();
          return;
        }
        applyFieldErrors(form, result.fieldErrors as FieldErrors<ExemptionFormState>);
        toast.error(result.message);
        return;
      }
      if (!("decline" in mode)) return;
      // A decline takes the note as its reason.
      const result = await declineMedicalEntry(mode.decline.entryId, {
        reason: values.declineReason,
        exemptionReason: values.exemptionReason,
        reviewDate: values.reviewDate,
      });
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      const { reason, ...rest } = result.fieldErrors ?? {};
      applyFieldErrors(form, {
        ...rest,
        ...(reason && { declineReason: reason }),
      } as FieldErrors<ExemptionFormState>);
      toast.error(result.message);
      // Refused for a reason other than the form's: someone gave, declined
      // or voided it first, or the animal is spayed or neutered by now.
      // Refreshing shows the page as it now is.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {record && (
          <FormField
            control={form.control}
            name="procedure"
            render={({ field }) => (
              <FormItem>
                <FormLabel id="exemption-procedure-label" required>
                  Exempt from
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    aria-labelledby="exemption-procedure-label"
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-wrap gap-4"
                  >
                    {procedures.map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={value} />
                        {SURGERY_PROCEDURE_LABELS[value]}
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
          name="exemptionReason"
          render={({ field }) => (
            <FormItem>
              <FormLabel id="exemption-reason-label" required>
                Reason for the exemption
              </FormLabel>
              <FormControl>
                <RadioGroup
                  aria-labelledby="exemption-reason-label"
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {Object.values(SpayNeuterExemptionReason).map((value) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value={value} />
                      {SPAY_NEUTER_EXEMPTION_REASON_LABELS[value]}
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="declineReason"
          render={({ field }) => (
            <FormItem>
              <FormLabel
                htmlFor="exemption-note"
                required={exemptionReason === SpayNeuterExemptionReason.OTHER}
              >
                Note
              </FormLabel>
              <FormControl>
                <Textarea
                  id="exemption-note"
                  placeholder={
                    exemptionReason === SpayNeuterExemptionReason.OTHER
                      ? "Why is the animal exempt?"
                      : "Anything else to know (optional)"
                  }
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {reviewable && (
          <DayField
            control={form.control}
            name="reviewDate"
            label="Review date"
            triggerClassName="w-full sm:w-64"
            description="Left empty, the exemption holds until it is voided. Once the day comes, it is due for review."
            disabledDates={(date) => {
              const day = format(date, "yyyy-MM-dd");
              return day < today || day > latest;
            }}
          />
        )}

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
