"use client";

import { useImperativeHandle, useRef, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
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
import {
  MedicalEntryKind,
  MedicalEntrySource,
  type SurgeryEvidence,
  type SurgeryProcedure,
} from "@/prisma/generated/enums";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import {
  editMedicalEntry,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
} from "@/app/lib/actions/medical-entry.actions";
import {
  MedicalEntryFormSchema,
  type MedicalEntryFormInput,
} from "@/app/lib/zod-schemas/medical-entry.schemas";
import {
  PICKABLE_SURGERY_EVIDENCE,
  SURGERY_EVIDENCE_LABELS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";
import { proceduresFor } from "@/app/lib/utils/spay-neuter";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";
import {
  GivenCareFields,
  MedicalTextField,
  MedicalTextareaField,
  vetClinicChoices,
  type GivenCareState,
} from "./medical-form-fields";
import type { ScheduledCare } from "./medical-entry-form";

/** The form's own state. No procedure until one is picked. */
type SurgeryFormState = GivenCareState & {
  kind: typeof MedicalEntryKind.SURGERY;
  procedure: SurgeryProcedure | "";
  evidence: SurgeryEvidence | null;
  surgeon: string;
  findings: string;
  anesthesiaNotes: string;
  notes: string;
};

const blank = (today: string): SurgeryFormState => ({
  kind: MedicalEntryKind.SURGERY,
  procedure: "",
  completedDate: today,
  dateUnknown: false,
  source: MedicalEntrySource.IN_HOUSE,
  vetPartnerId: null,
  vetName: "",
  evidence: null,
  surgeon: "",
  findings: "",
  anesthesiaNotes: "",
  notes: "",
});

const fromEntry = (entry: MedicalEntryDisplay): SurgeryFormState => ({
  kind: MedicalEntryKind.SURGERY,
  procedure: entry.procedure ?? "",
  completedDate: entry.completedDate,
  dateUnknown: entry.completedDate === null,
  // Only completed entries are edited, and every one has a source; the
  // fallback is the record form's default.
  source: entry.source ?? MedicalEntrySource.IN_HOUSE,
  vetPartnerId: entry.vetPartnerId,
  vetName: entry.vetName ?? "",
  evidence: entry.surgery?.evidence ?? null,
  surgeon: entry.surgery?.surgeon ?? "",
  findings: entry.surgery?.findings ?? "",
  anesthesiaNotes: entry.surgery?.anesthesiaNotes ?? "",
  notes: entry.notes ?? "",
});

interface Props {
  animalId: string;
  options: MedicalEntryFormOptions;
  /** Present when editing. */
  entry?: MedicalEntryDisplay;
  /** Present when recording a scheduled surgery as done. */
  scheduled?: ScheduledCare;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

/**
 * Records a surgery: what was done, how and when, and how it went. One done
 * before intake says what shows it was done. Also edits one, and records a
 * scheduled one as done.
 */
export function SurgeryEntryForm({
  animalId,
  options,
  entry,
  scheduled,
  onFormSubmit,
  ref,
}: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  const vetClinics = vetClinicChoices(options.vetClinics, entry);
  const own = entry?.procedure ?? scheduled?.procedure ?? null;
  // A spay or neuter only as the animal's sex allows. The procedure already
  // on the entry stays on offer: the animal's sex may have been corrected
  // since, and the entry is only checked again if its procedure changes.
  const procedures = proceduresFor(options.sex);
  if (own && !procedures.includes(own)) procedures.unshift(own);

  const form = useForm<SurgeryFormState>({
    // The schema reads the state as a surgery and drops `dateUnknown`, so
    // what reaches onSubmit is the schema's output.
    resolver: standardSchemaResolver(
      MedicalEntryFormSchema,
    ) as unknown as Resolver<SurgeryFormState>,
    defaultValues: entry
      ? fromEntry(entry)
      : {
          ...blank(options.today),
          procedure: scheduled?.procedure ?? "",
          notes: scheduled?.notes ?? "",
        },
  });
  const source = useWatch({ control: form.control, name: "source" });

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () =>
        haveFormValuesChanged(form.getValues(), initialValuesRef.current),
    }),
    [form],
  );

  const onSubmit = (state: SurgeryFormState) => {
    const values = state as unknown as MedicalEntryFormInput;
    startSubmitTransition(async () => {
      const result = entry
        ? await editMedicalEntry(entry.id, values)
        : scheduled
          ? await recordScheduledMedicalEntry(scheduled.id, values)
          : await recordMedicalEntry(animalId, values);
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<SurgeryFormState>);
      toast.error(result.message);
    });
  };

  // A spay or neuter an exam found keeps how it was found: before intake,
  // with that exam as its evidence. It is voided and recorded again to change
  // either.
  const foundOnExam = Boolean(entry?.surgery?.foundOnExamId);
  // A surgery scheduled during the stay was done then, never before intake.
  const sources = foundOnExam
    ? [MedicalEntrySource.BEFORE_INTAKE]
    : Object.values(MedicalEntrySource).filter(
        (value) => !scheduled || value !== MedicalEntrySource.BEFORE_INTAKE,
      );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="procedure"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel htmlFor="procedure" required>
                  Procedure
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="procedure">
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
                <FormMessage />
              </FormItem>
            )}
          />

          <GivenCareFields
            form={form}
            sources={sources}
            vetClinics={vetClinics}
            today={options.today}
            // Evidence is only for a surgery done before intake.
            onSourceChange={(next) => {
              if (next !== MedicalEntrySource.BEFORE_INTAKE) {
                form.setValue("evidence", null);
              }
            }}
          />

          {foundOnExam && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Evidence</p>
              <p className="text-sm text-muted-foreground">
                {SURGERY_EVIDENCE_LABELS.FOUND_ON_EXAM}. Void this entry and
                record it again to change how it was found.
              </p>
            </div>
          )}

          {source === MedicalEntrySource.BEFORE_INTAKE && !foundOnExam && (
            <FormField
              control={form.control}
              name="evidence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="evidence" required>
                    Evidence
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                    name={field.name}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" id="evidence">
                        <SelectValue placeholder="What shows it was done" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PICKABLE_SURGERY_EVIDENCE.map((value) => (
                        <SelectItem key={value} value={value}>
                          {SURGERY_EVIDENCE_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <MedicalTextField control={form.control} name="surgeon" label="Surgeon" />
          <MedicalTextareaField
            control={form.control}
            name="findings"
            label="Findings"
          />
          <MedicalTextareaField
            control={form.control}
            name="anesthesiaNotes"
            label="Anesthesia notes"
          />
          <MedicalTextareaField control={form.control} name="notes" label="Notes" />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {entry ? "Save Changes" : "Record Surgery"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
