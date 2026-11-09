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
import { CareEpisodeType } from "@/prisma/generated/enums";
import {
  editCareEpisode,
  openCareEpisode,
} from "@/app/lib/actions/care-episode.actions";
import {
  CareEpisodeFormSchema,
  type CareEpisodeFormInput,
} from "@/app/lib/zod-schemas/care-episode.schemas";
import { CARE_EPISODE_TYPE_LABELS } from "@/app/lib/constants/medical";
import type { CareEpisodeDisplay } from "@/app/lib/data/animals/medical-condition.data";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";
import { MedicalTextareaField, OptionalSelectField } from "./medical-form-fields";

/** The form's own state: every field as the inputs hold it. */
type CareEpisodeFormState = {
  type: CareEpisodeType;
  startDate: string | null;
  endDate: string | null;
  reason: string;
  partnerId: string | null;
  notes: string;
};

/**
 * What the form does: open an episode (or record one already over), maybe
 * starting from a type, or correct a stored one.
 */
export type CareEpisodeFormMode =
  | { open: { type?: CareEpisodeType } }
  | { edit: CareEpisodeDisplay };

interface Props {
  animalId: string;
  mode: CareEpisodeFormMode;
  /** Active vet clinics. */
  vetClinics: { id: string; name: string }[];
  /** The shelter's today: neither day can be after it. */
  today: CalendarDay;
  /** The submit button's text. */
  submitLabel: string;
  /** The button that closes the form unsaved: "Cancel" unless given. */
  cancelLabel?: string;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

// What each type is, under its label.
const TYPE_HINTS: Record<CareEpisodeType, string> = {
  UNDER_VET_CARE: "Being treated, here or by an outside vet, without a stay.",
  HOSPITALISED_IN_HOUSE: "Kept in the shelter's own medical care.",
  HOSPITALISED_OFF_SITE: "Staying at a vet clinic.",
};

/**
 * Opens a care episode, records one already over, or corrects one: its
 * type, the clinic for a stay off site or vet care at a clinic, the days and
 * the reason. Clearing the end day of a closed episode opens it again.
 */
export function CareEpisodeForm({
  animalId,
  mode,
  vetClinics,
  today,
  submitLabel,
  cancelLabel = "Cancel",
  onFormSubmit,
  ref,
}: Props) {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();
  const stored = "edit" in mode ? mode.edit : null;

  const form = useForm<CareEpisodeFormState>({
    // The schema reads the state as the action takes it.
    resolver: standardSchemaResolver(
      CareEpisodeFormSchema,
    ) as unknown as Resolver<CareEpisodeFormState>,
    defaultValues: stored
      ? {
          type: stored.type,
          startDate: stored.startDate,
          endDate: stored.endDate,
          reason: stored.reason,
          partnerId: stored.partnerId,
          notes: stored.notes ?? "",
        }
      : {
          type: ("open" in mode && mode.open.type) || CareEpisodeType.UNDER_VET_CARE,
          startDate: today,
          endDate: null,
          reason: "",
          partnerId: null,
          notes: "",
        },
  });
  const type = useWatch({ control: form.control, name: "type" });

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () =>
        haveFormValuesChanged(form.getValues(), initialValuesRef.current),
      // For a dialog that shouldn't close under a save.
      isPending: () => isPending,
    }),
    [form, isPending],
  );

  // A correction keeps a clinic made inactive since.
  const clinicOptions = vetClinics.map((clinic) => ({
    value: clinic.id,
    label: clinic.name,
  }));
  if (
    stored?.partnerId &&
    stored.partner &&
    !clinicOptions.some((option) => option.value === stored.partnerId)
  ) {
    clinicOptions.push({ value: stored.partnerId, label: stored.partner.name });
  }

  const afterToday = (date: Date) => format(date, "yyyy-MM-dd") > today;

  const onSubmit = (state: CareEpisodeFormState) => {
    // The form's resolver already parsed the state; the action parses it
    // again from what is sent.
    const values = state as unknown as CareEpisodeFormInput;
    startSubmitTransition(async () => {
      const result = stored
        ? await editCareEpisode(stored.id, values)
        : await openCareEpisode(animalId, values);
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<CareEpisodeFormState>);
      toast.error(result.message);
      // Refused for a reason other than the form's, most likely because
      // someone voided it first. Refreshing shows the episode as it now is.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel id="care-episode-type-label" required>
                Kind of care
              </FormLabel>
              <FormControl>
                <RadioGroup
                  aria-labelledby="care-episode-type-label"
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    // A stay in house has no clinic.
                    if (value === CareEpisodeType.HOSPITALISED_IN_HOUSE) {
                      form.setValue("partnerId", null);
                      form.clearErrors("partnerId");
                    }
                  }}
                  className="grid gap-3"
                >
                  {Object.values(CareEpisodeType).map((value) => (
                    <label key={value} className="flex items-start gap-2 text-sm">
                      <RadioGroupItem value={value} className="mt-0.5" />
                      <span>
                        {CARE_EPISODE_TYPE_LABELS[value]}
                        <span className="block text-xs text-muted-foreground">
                          {TYPE_HINTS[value]}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {type !== CareEpisodeType.HOSPITALISED_IN_HOUSE && (
          <OptionalSelectField
            control={form.control}
            name="partnerId"
            label={
              type === CareEpisodeType.HOSPITALISED_OFF_SITE
                ? "Clinic"
                : "Clinic (if an outside vet)"
            }
            required={type === CareEpisodeType.HOSPITALISED_OFF_SITE}
            noneLabel="None"
            options={clinicOptions}
          />
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          <DayField
            control={form.control}
            name="startDate"
            label="Start date"
            required
            triggerClassName="w-full"
            disabledDates={afterToday}
          />
          <DayField
            control={form.control}
            name="endDate"
            label="End date"
            triggerClassName="w-full"
            description={stored ? undefined : "Only if the episode is already over."}
            disabledDates={afterToday}
          />
        </div>

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="care-episode-reason" required>
                Reason
              </FormLabel>
              <FormControl>
                <Textarea
                  id="care-episode-reason"
                  placeholder="Why is the animal under care?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <MedicalTextareaField control={form.control} name="notes" label="Notes" />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              {cancelLabel}
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
