"use client";

import { reportCareDefaults, type ReportEntryContext } from "@/app/lib/utils/vet-visit-report";

import { useImperativeHandle, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldErrors as FormFieldErrors,
  type Resolver,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  ExamFindingStatus,
  ExamResult,
  ExamType,
  MedicalEntryKind,
  MedicalEntrySource,
  ReproductiveStatus,
  SurgeryProcedure,
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
  EXAM_FINDING_STATUS_LABELS,
  EXAM_RESULT_LABELS,
  EXAM_TYPE_LABELS,
  REPRODUCTIVE_STATUS_LABELS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";
import { examBodySystemLabel } from "@/app/lib/constants/exam";
import {
  blankFindings,
  examFindingsIssue,
  orderFindings,
} from "@/app/lib/utils/exam-findings";
import { procedureSexIssue } from "@/app/lib/utils/spay-neuter";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";
import { VitalsMeasurementFields } from "@/components/dashboard/animals/vitals/vitals-measurement-fields";
import {
  GivenCareFields,
  MedicalTextareaField,
  NONE,
  vetClinicChoices,
  type GivenCareState,
} from "./medical-form-fields";
import type { ScheduledCare } from "./medical-entry-form";
import { examVitalsText } from "./medical-entry-item";

type FindingState = {
  bodySystem: string;
  status: ExamFindingStatus;
  notes: string;
};

/**
 * The form's own state. No type or result until one is picked. The vitals
 * are blank until measured. `foundAlteredOn` is the form's alone: the spay or
 * neuter is sent only when the form offers it and the box is ticked.
 */
type ExamFormState = GivenCareState & {
  kind: typeof MedicalEntryKind.EXAM;
  examType: ExamType | "";
  overallResult: ExamResult | "";
  findings: FindingState[];
  reproductiveStatus: ReproductiveStatus | null;
  vitals: {
    weightGrams: number | null;
    temperatureC: number | null;
    bodyConditionScore: number | null;
  };
  foundAlteredOn: boolean;
  foundAltered: { procedure: SurgeryProcedure | "" };
  notes: string;
};

const SPAY_NEUTER = [SurgeryProcedure.SPAY, SurgeryProcedure.NEUTER];

type RowErrors = FormFieldErrors<FindingState> | undefined;

const blank = (
  today: string,
  foundProcedure: SurgeryProcedure | "",
): ExamFormState => ({
  kind: MedicalEntryKind.EXAM,
  examType: "",
  completedDate: today,
  dateUnknown: false,
  source: MedicalEntrySource.IN_HOUSE,
  vetPartnerId: null,
  vetName: "",
  overallResult: "",
  findings: blankFindings(),
  reproductiveStatus: null,
  vitals: { weightGrams: null, temperatureC: null, bodyConditionScore: null },
  foundAlteredOn: true,
  foundAltered: { procedure: foundProcedure },
  notes: "",
});

const fromEntry = (entry: MedicalEntryDisplay): ExamFormState => ({
  ...blank(entry.completedDate ?? "", ""),
  examType: entry.examType ?? "",
  completedDate: entry.completedDate,
  // Only completed entries are edited, and every one has a source; the
  // fallback is the record form's default.
  source: entry.source ?? MedicalEntrySource.IN_HOUSE,
  vetPartnerId: entry.vetPartnerId,
  vetName: entry.vetName ?? "",
  overallResult: entry.exam?.overallResult ?? "",
  // The systems the exam was recorded with, which a correction is held to.
  findings: orderFindings(entry.exam?.findings ?? []).map((row) => ({
    bodySystem: row.bodySystem,
    status: row.status,
    notes: row.notes ?? "",
  })),
  reproductiveStatus: entry.exam?.reproductiveStatus ?? null,
  notes: entry.notes ?? "",
});

const STATUSES = Object.values(ExamFindingStatus);

interface Props {
  report?: ReportEntryContext;
  animalId: string;
  options: MedicalEntryFormOptions;
  /** Present when editing. */
  entry?: MedicalEntryDisplay;
  /** Present when recording a scheduled exam as done. */
  scheduled?: ScheduledCare;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

/**
 * Records an exam: its type, who did it and when, a finding for each body
 * system, what it concluded, and whether the animal is intact. Recording one
 * can bring the vitals measured during it, written as a vitals entry, and
 * the spay or neuter it found on an animal not altered on its record. Also
 * edits one, and records a scheduled one as done; a correction leaves the
 * vitals entry to the Vitals page.
 */
export function ExamEntryForm({
  animalId,
  options,
  entry,
  scheduled,
  report,
  onFormSubmit,
  ref,
}: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  const vetClinics = vetClinicChoices(options.vetClinics, entry);
  // A spay or neuter only as the animal's sex allows: picked for it when
  // only one does.
  const foundProcedures = SPAY_NEUTER.filter(
    (value) => !procedureSexIssue(value, options.sex),
  );
  const foundProcedure = foundProcedures.length === 1 ? foundProcedures[0] : "";

  // The spay or neuter is offered when a new exam finds the animal altered
  // and its record doesn't say so yet.
  const offersFoundAltered = (state: Pick<ExamFormState, "reproductiveStatus">) =>
    !entry &&
    !options.altered &&
    state.reproductiveStatus === ReproductiveStatus.ALTERED;

  const schemaResolver = standardSchemaResolver(
    MedicalEntryFormSchema,
  ) as unknown as Resolver<ExamFormState>;
  const form = useForm<ExamFormState>({
    // The schema reads the state as an exam and drops what an exam doesn't
    // send, so what reaches onSubmit is the schema's output. The spay or
    // neuter goes only when offered and ticked. An abnormal finding with no
    // note is shown on its own row, rather than once for the list.
    resolver: async (state, context, resolverOptions) => {
      const result = await schemaResolver(
        {
          ...state,
          foundAltered:
            offersFoundAltered(state) && state.foundAlteredOn
              ? state.foundAltered
              : (null as unknown as ExamFormState["foundAltered"]),
        },
        context,
        resolverOptions,
      );
      const unexplained = (row: FindingState) =>
        row.status === ExamFindingStatus.ABNORMAL && !row.notes.trim();
      if (!state.findings.some(unexplained)) return result;
      // Each row's own errors stay (a note too long), and the note it lacks
      // is added to them. The schema's errors are keyed by row number, beside
      // the list's own under `root`.
      const rows: RowErrors[] = [];
      for (const [key, value] of Object.entries(result.errors.findings ?? {})) {
        if (/^\d+$/.test(key)) rows[Number(key)] = value as RowErrors;
      }
      state.findings.forEach((row, index) => {
        if (!unexplained(row)) return;
        rows[index] = {
          ...rows[index],
          notes: rows[index]?.notes ?? {
            type: "custom",
            message: "Say what was found.",
          },
        };
      });
      // The list's own message is kept only when it is about something other
      // than those notes, which the rows now say.
      const listIssue = examFindingsIssue(
        state.findings.map((row) => (unexplained(row) ? { ...row, notes: "-" } : row)),
        state.findings.map((row) => row.bodySystem),
      );
      const findings = Object.assign(
        rows,
        listIssue ? { root: { type: "custom", message: listIssue } } : {},
      ) as FormFieldErrors<ExamFormState>["findings"];
      return { values: {}, errors: { ...result.errors, findings } };
    },
    defaultValues: entry
      ? fromEntry(entry)
      : {
          ...blank(options.today, foundProcedure),
          examType: scheduled?.examType ?? "",
          notes: scheduled?.notes ?? "",
          ...reportCareDefaults(report),
        },
  });
  const findings = useFieldArray({
    control: form.control,
    name: "findings",
    keyName: "key",
  });
  const [reproductiveStatus, foundAlteredOn, findingValues] = useWatch({
    control: form.control,
    name: ["reproductiveStatus", "foundAlteredOn", "findings"],
  });
  const offered = offersFoundAltered({ reproductiveStatus });

  // A note shows on an abnormal finding, which needs one, and on any finding
  // that has one. Any other finding can be given one.
  const [notesAdded, setNotesAdded] = useState<string[]>([]);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const showsNote = (row: FindingState) =>
    row.status === ExamFindingStatus.ABNORMAL ||
    row.notes !== "" ||
    notesAdded.includes(row.bodySystem);

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isPending: () => isPending,
      isDirty: () =>
        haveFormValuesChanged(form.getValues(), initialValuesRef.current),
    }),
    [form, isPending],
  );

  const onSubmit = (state: ExamFormState) => {
    const values = state as unknown as MedicalEntryFormInput;
    startSubmitTransition(async () => {
      const result = entry
        ? await editMedicalEntry(entry.id, values)
        : scheduled
          ? await recordScheduledMedicalEntry(scheduled.id, values, report?.id)
          : await recordMedicalEntry(animalId, values, report?.id);
      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<ExamFormState>);
      toast.error(result.message);
    });
  };

  // The service files a refusal of the findings as a whole on the list.
  const findingsError = form.formState.errors.findings;
  const findingsErrorMessage =
    findingsError?.message ?? findingsError?.root?.message;
  const foundAlteredError = form.formState.errors.foundAltered?.message;
  const linkedVitals = entry?.exam?.vitalsLog;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="examType"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel htmlFor="examType" required>
                  Exam type
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="examType">
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

          {/* An exam is done in the shelter or by an outside vet, on a day
              that is known. */}
          <GivenCareFields
            form={form}
            sources={[MedicalEntrySource.IN_HOUSE, MedicalEntrySource.OUTSIDE_VET]}
            vetClinics={vetClinics}
            today={options.today}
          />

          <FormField
            control={form.control}
            name="overallResult"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel id="overall-result-label" required>
                  Overall result
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    aria-labelledby="overall-result-label"
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-wrap gap-4"
                  >
                    {Object.values(ExamResult).map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={value} />
                        {EXAM_RESULT_LABELS[value]}
                      </label>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <fieldset className="space-y-3 md:col-span-2">
            <legend className="text-sm font-medium">
              Findings <span className="text-destructive">*</span>
            </legend>
            <p className="text-sm text-muted-foreground">
              Each body system as it looked. An abnormal finding needs a note
              saying what was found.
            </p>
            <ul className="divide-y rounded-lg border">
              {findings.fields.map((row, index) => {
                const label = examBodySystemLabel(row.bodySystem);
                const labelId = `finding-${row.bodySystem}-label`;
                const value = findingValues?.[index] ?? row;
                const abnormal = value.status === ExamFindingStatus.ABNORMAL;
                return (
                  <li key={row.key} className="space-y-2 px-3 py-2">
                    <FormField
                      control={form.control}
                      name={`findings.${index}.status`}
                      render={({ field }) => (
                        <FormItem className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                          <FormLabel id={labelId} className="font-normal">
                            {label}
                          </FormLabel>
                          <FormControl>
                            <RadioGroup
                              aria-labelledby={labelId}
                              value={field.value}
                              onValueChange={(next) => {
                                field.onChange(next);
                                // Whether the note is required follows the
                                // status, so once the form has been checked,
                                // the note is checked again with it.
                                if (form.formState.isSubmitted) {
                                  void form.trigger(`findings.${index}.notes`);
                                }
                              }}
                              className="flex flex-wrap gap-3"
                            >
                              {STATUSES.map((status) => (
                                <label
                                  key={status}
                                  className="flex items-center gap-1.5 text-sm"
                                >
                                  <RadioGroupItem value={status} />
                                  {EXAM_FINDING_STATUS_LABELS[status]}
                                </label>
                              ))}
                            </RadioGroup>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {showsNote(value) ? (
                      <FormField
                        control={form.control}
                        name={`findings.${index}.notes`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel
                              htmlFor={`finding-${row.bodySystem}-note`}
                              className="sr-only"
                              required={abnormal}
                            >
                              {label} note
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                id={`finding-${row.bodySystem}-note`}
                                rows={2}
                                className="min-h-0"
                                placeholder={abnormal ? "What was found" : "Note"}
                                autoFocus={focusNote === row.bodySystem}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-muted-foreground"
                        aria-label={`Add a note on ${label.toLowerCase()}`}
                        onClick={() => {
                          setNotesAdded((added) => [...added, row.bodySystem]);
                          setFocusNote(row.bodySystem);
                        }}
                      >
                        Add note
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {findingsErrorMessage && (
              <p className="text-sm text-destructive">{findingsErrorMessage}</p>
            )}
          </fieldset>

          <FormField
            control={form.control}
            name="reproductiveStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="reproductiveStatus">
                  Reproductive status
                </FormLabel>
                <Select
                  onValueChange={(value) =>
                    field.onChange(value === NONE ? null : value)
                  }
                  value={field.value ?? NONE}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="reproductiveStatus">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>Not recorded</SelectItem>
                    {Object.values(ReproductiveStatus).map((value) => (
                      <SelectItem key={value} value={value}>
                        {REPRODUCTIVE_STATUS_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {offered && (
            <fieldset className="space-y-3 rounded-lg border p-4 md:col-span-2">
              <legend className="sr-only">Spay or neuter found</legend>
              <FormField
                control={form.control}
                name="foundAlteredOn"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(!!checked)}
                    />
                    Record the spay or neuter found on this exam
                  </label>
                )}
              />
              <p className="text-sm text-muted-foreground">
                It is recorded as done before intake, on an unknown date, with
                this exam as its evidence.
              </p>
              {foundAlteredOn && (
                <FormField
                  control={form.control}
                  name="foundAltered.procedure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel id="found-procedure-label" required>
                        Procedure
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          aria-labelledby="found-procedure-label"
                          value={field.value}
                          onValueChange={field.onChange}
                          className="flex flex-wrap gap-4"
                        >
                          {foundProcedures.map((value) => (
                            <label
                              key={value}
                              className="flex items-center gap-2 text-sm"
                            >
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
              {foundAlteredError && (
                <p className="text-sm text-destructive">{foundAlteredError}</p>
              )}
            </fieldset>
          )}

          {entry ? (
            linkedVitals && (
              <div className="space-y-1 md:col-span-2">
                <p className="text-sm font-medium">Vitals</p>
                <p className="text-sm text-muted-foreground">
                  {linkedVitals.deletedAt
                    ? "Vitals entry deleted."
                    : `${examVitalsText(linkedVitals, options.weightUnitSystem)}.`}{" "}
                  <Link
                    href={`/dashboard/animals/${animalId}/medical/vitals`}
                    className="underline underline-offset-4"
                  >
                    Edit on the Vitals page
                  </Link>
                </p>
              </div>
            )
          ) : (
            <fieldset className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
              <legend className="mb-1 text-sm font-medium">Vitals</legend>
              <p className="text-sm text-muted-foreground md:col-span-3">
                Optional. Any measured are recorded as a vitals entry, which
                is corrected on the Vitals page.
              </p>
              <VitalsMeasurementFields
                control={form.control}
                prefix="vitals."
                unitSystem={options.weightUnitSystem}
              />
            </fieldset>
          )}

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
            {entry ? "Save Changes" : "Record Exam"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
