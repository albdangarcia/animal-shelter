"use client";

import { reportCareDefaults, type ReportEntryContext } from "@/app/lib/utils/vet-visit-report";

import { useEffect, useImperativeHandle, useRef, useTransition } from "react";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { NumberField } from "@/components/forms/number-field";
import {
  DoseUnit,
  MedicalEntryKind,
  MedicalEntrySource,
  MedicalRoute,
  TestResult,
} from "@/prisma/generated/enums";
import type {
  MedicalEntryFormItem,
  MedicalEntryFormOptions,
} from "@/app/lib/data/medical-catalog.data";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import {
  editMedicalEntry,
  recordMedicalEntry,
  recordScheduledMedicalEntry,
} from "@/app/lib/actions/medical-entry.actions";
import {
  MedicalEntryFormSchema,
  rabiesDurationIssue,
  type MedicalEntryFormInput,
  type MedicalEntryFormValues,
} from "@/app/lib/zod-schemas/medical-entry.schemas";
import {
  MEDICAL_ENTRY_KIND_LABELS,
  isCatalogEntryKind,
  TEST_RESULT_LABELS,
} from "@/app/lib/constants/medical";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { switchItem } from "@/app/lib/utils/medical-item-fills";
import { latestDueDate, nextDueDate } from "@/app/lib/utils/medical-days";
import {
  nextDoseItem,
  withoutInactiveNextDose,
} from "@/app/lib/utils/medical-next-dose";
import {
  formatShelterDayOrNA,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";
import {
  DoseUnitField,
  GivenCareFields,
  MedicalRouteField,
  MedicalTextField,
  vetClinicChoices,
} from "./medical-form-fields";

/** What recording scheduled care needs of the entry: it fills in the rest. */
export type ScheduledCare = Pick<
  MedicalEntryDisplay,
  "id" | "kind" | "itemId" | "procedure" | "examType" | "notes"
>;

/**
 * The form's own state: every kind's fields at once, flat, so one form serves
 * all three kinds. The schema validates the kind's fields and drops the rest.
 * `dateUnknown` and `scheduleNextOn` are the form's alone: the next dose is
 * sent only when the form offers it and the box is ticked.
 */
type EntryFormState = {
  kind: MedicalEntryKind;
  itemId: string;
  completedDate: string | null;
  dateUnknown: boolean;
  source: MedicalEntrySource;
  vetPartnerId: string | null;
  vetName: string;
  notes: string;
  manufacturer: string;
  lotNumber: string;
  lotExpiryDate: string | null;
  route: MedicalRoute | null;
  site: string;
  rabiesTagNumber: string;
  durationMonths: number | null;
  results: { analyteId: string; analyteName: string; result: TestResult | "" }[];
  doseAmount: number | null;
  doseUnit: DoseUnit | null;
  scheduleNextOn: boolean;
  scheduleNext: { dueDate: string | null };
};

const fromEntry = (entry: MedicalEntryDisplay): EntryFormState => ({
  kind: entry.kind,
  // This form serves vaccines, tests and treatments, which all have an item.
  itemId: entry.itemId ?? "",
  completedDate: entry.completedDate,
  dateUnknown: entry.completedDate === null,
  // Only completed entries are edited, and every one has a source; the
  // fallback is the record form's default.
  source: entry.source ?? MedicalEntrySource.IN_HOUSE,
  vetPartnerId: entry.vetPartnerId,
  vetName: entry.vetName ?? "",
  notes: entry.notes ?? "",
  manufacturer: entry.vaccine?.manufacturer ?? "",
  lotNumber: entry.vaccine?.lotNumber ?? entry.test?.lotNumber ?? "",
  lotExpiryDate:
    entry.vaccine?.lotExpiryDate ?? entry.test?.lotExpiryDate ?? null,
  route: entry.vaccine?.route ?? entry.treatment?.route ?? null,
  site: entry.vaccine?.site ?? "",
  rabiesTagNumber: entry.vaccine?.rabiesTagNumber ?? "",
  durationMonths: entry.vaccine?.durationMonths ?? null,
  results: (entry.test?.results ?? []).map((row) => ({ ...row })),
  doseAmount: entry.treatment?.doseAmount ?? null,
  doseUnit: entry.treatment?.doseUnit ?? null,
  scheduleNextOn: false,
  scheduleNext: { dueDate: null },
});

const blank = (kind: MedicalEntryKind, today: string): EntryFormState => ({
  kind,
  itemId: "",
  completedDate: today,
  dateUnknown: false,
  source: MedicalEntrySource.IN_HOUSE,
  vetPartnerId: null,
  vetName: "",
  notes: "",
  manufacturer: "",
  lotNumber: "",
  lotExpiryDate: null,
  route: null,
  site: "",
  rabiesTagNumber: "",
  durationMonths: null,
  results: [],
  doseAmount: null,
  doseUnit: null,
  scheduleNextOn: true,
  scheduleNext: { dueDate: null },
});

/**
 * Scheduled care being recorded: its item, with what picking that item fills
 * in, and its notes.
 */
const fromScheduled = (
  scheduled: ScheduledCare,
  item: MedicalEntryFormItem | undefined,
  today: CalendarDay,
): EntryFormState => ({
  ...blank(scheduled.kind, today),
  ...(item && fillsFor(item)),
  itemId: scheduled.itemId ?? "",
  notes: scheduled.notes ?? "",
});

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/**
 * The items this entry can pick. Scheduled care being recorded keeps its own
 * item even when that item has since been retired or narrowed to other
 * species, as the catalog has it now: its details are written for the first
 * time. An entry being edited keeps its own item too, held to what it was
 * recorded with: the results it was recorded with, and the rabies fields only
 * if it was recorded as a rabies vaccine, whatever the catalog says now.
 */
const itemChoices = (
  kind: MedicalEntryKind,
  options: MedicalEntryFormOptions,
  entry?: MedicalEntryDisplay,
  scheduled?: ScheduledCare,
): MedicalEntryFormItem[] => {
  // Only care given from the catalog picks an item.
  if (!isCatalogEntryKind(kind)) return [];
  const ofKind = options.items.filter((item) => item.kind === kind);
  if (scheduled) {
    if (ofKind.some((item) => item.id === scheduled.itemId)) return ofKind;
    const own = options.scheduledItems.find(
      (item) => item.id === scheduled.itemId,
    );
    return own ? [...ofKind, own].sort(byName) : ofKind;
  }
  if (!entry?.itemId || !entry.item) return ofKind;
  const recordedAnalytes = (entry.test?.results ?? []).map((row) => ({
    id: row.analyteId,
    name: row.analyteName,
  }));
  const own = ofKind.find((item) => item.id === entry.itemId);
  const others = ofKind.filter((item) => item.id !== entry.itemId);
  return [
    {
      id: entry.itemId,
      kind,
      name: entry.item.name,
      // Every rabies entry stores its duration.
      isRabies: entry.vaccine?.durationMonths != null,
      manufacturer: own?.manufacturer ?? null,
      defaultRoute: own?.defaultRoute ?? null,
      defaultDoseAmount: own?.defaultDoseAmount ?? null,
      defaultDoseUnit: own?.defaultDoseUnit ?? null,
      repeatIntervalDays: own?.repeatIntervalDays ?? null,
      analytes: recordedAnalytes,
      scheduledEntryIds: own?.scheduledEntryIds ?? [],
    },
    ...others,
  ].sort(byName);
};

/** The fields picking an item fills in, for each kind. */
const FILLED_FIELDS = {
  [MedicalEntryKind.VACCINE]: [
    "manufacturer",
    "route",
    "rabiesTagNumber",
    "durationMonths",
  ],
  [MedicalEntryKind.TEST]: [],
  [MedicalEntryKind.TREATMENT]: ["route", "doseAmount", "doseUnit"],
  // Not given from the catalog, so there is no item to fill anything in.
  [MedicalEntryKind.SURGERY]: [],
  [MedicalEntryKind.MICROCHIP]: [],
  [MedicalEntryKind.EXAM]: [],
} as const satisfies Record<MedicalEntryKind, readonly (keyof EntryFormState)[]>;

type FilledField = (typeof FILLED_FIELDS)[MedicalEntryKind][number];
type Fills = Pick<EntryFormState, FilledField | "results">;

/** The item-filled fields of the form's state, rows copied. */
const pickFills = (state: EntryFormState): Fills => ({
  manufacturer: state.manufacturer,
  route: state.route,
  rabiesTagNumber: state.rabiesTagNumber,
  durationMonths: state.durationMonths,
  doseAmount: state.doseAmount,
  doseUnit: state.doseUnit,
  results: state.results.map((row) => ({ ...row })),
});

/** What picking `item` fills in: the catalog's defaults. */
const fillsFor = (item: MedicalEntryFormItem): Fills => ({
  manufacturer: item.manufacturer ?? "",
  route: item.defaultRoute,
  rabiesTagNumber: "",
  durationMonths: null,
  doseAmount: item.defaultDoseAmount,
  doseUnit: item.defaultDoseUnit,
  results: item.analytes.map((analyte) => ({
    analyteId: analyte.id,
    analyteName: analyte.name,
    result: "",
  })),
});

interface Props {
  report?: ReportEntryContext;
  animalId: string;
  kind: MedicalEntryKind;
  options: MedicalEntryFormOptions;
  /** Present when editing. */
  entry?: MedicalEntryDisplay;
  /** Present when recording scheduled care as given. */
  scheduled?: ScheduledCare;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

export function MedicalEntryForm({
  animalId,
  kind,
  options,
  entry,
  scheduled,
  report,
  onFormSubmit,
  ref,
}: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  const items = itemChoices(kind, options, entry, scheduled);
  const vetClinics = vetClinicChoices(options.vetClinics, entry);

  // Editing never schedules the next dose: the service ignores it there.
  const offeredNextDose = (state: EntryFormState) =>
    entry ? null : nextDoseItem(state, options, scheduled?.id);
  const suggestedNextDay = (state: EntryFormState): string | null => {
    const nextItem = offeredNextDose(state);
    return nextItem?.repeatIntervalDays && state.completedDate
      ? nextDueDate(
          state.completedDate as CalendarDay,
          nextItem.repeatIntervalDays,
          options.today,
        )
      : null;
  };

  const defaultValues = (): EntryFormState => {
    if (entry) return fromEntry(entry);
    const base = scheduled
      ? fromScheduled(
          scheduled,
          items.find((candidate) => candidate.id === scheduled.itemId),
          options.today,
        )
      : blank(kind, options.today);
    const state = { ...base, ...reportCareDefaults(report) };
    return { ...state, scheduleNext: { dueDate: suggestedNextDay(state) } };
  };

  // The schema reads the flat state as the kind's shape and drops the fields
  // that kind doesn't have, so what reaches onSubmit is the schema's output,
  // not this state.
  const schemaResolver = standardSchemaResolver(
    MedicalEntryFormSchema,
  ) as unknown as Resolver<EntryFormState>;
  const form = useForm<EntryFormState>({
    // The next dose goes to the schema only when the form offers it and the
    // box is ticked; otherwise there is none.
    resolver: (state, context, resolverOptions) =>
      schemaResolver(
        {
          ...state,
          scheduleNext:
            state.scheduleNextOn && offeredNextDose(state)
              ? state.scheduleNext
              : (null as unknown as EntryFormState["scheduleNext"]),
        },
        context,
        resolverOptions,
      ),
    defaultValues: defaultValues(),
  });
  const results = useFieldArray({
    control: form.control,
    name: "results",
    keyName: "key",
  });
  const [itemId, source, dateUnknown, completedDate, scheduleNextOn] = useWatch({
    control: form.control,
    name: ["itemId", "source", "dateUnknown", "completedDate", "scheduleNextOn"],
  });
  const item = items.find((candidate) => candidate.id === itemId);
  const nextItem = entry
    ? null
    : nextDoseItem(
        { itemId, source, completedDate, dateUnknown },
        options,
        scheduled?.id,
      );

  const comparable = (state: EntryFormState) =>
    withoutInactiveNextDose(state, !!offeredNextDose(state));
  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isPending: () => isPending,
      isDirty: () =>
        haveFormValuesChanged(
          comparable(form.getValues()),
          comparable(initialValuesRef.current),
        ),
    }),
    // Rebuilt each render: what the form offers depends on its options.
  );

  // The next dose's day follows the day given and the item's interval until
  // someone picks a day of their own.
  const lastSuggestedDay = useRef(form.getValues("scheduleNext.dueDate"));
  const nextDayPicked = useRef(false);
  const nextInterval = nextItem?.repeatIntervalDays ?? null;
  useEffect(() => {
    if (nextInterval === null || !completedDate) return;
    if (form.getValues("scheduleNext.dueDate") !== lastSuggestedDay.current) {
      nextDayPicked.current = true;
    }
    if (nextDayPicked.current) return;
    const suggested = nextDueDate(
      completedDate as CalendarDay,
      nextInterval,
      options.today,
    );
    lastSuggestedDay.current = suggested;
    form.setValue("scheduleNext.dueDate", suggested);
  }, [completedDate, nextInterval, form, options.today]);

  // What each item held when the form left it, so coming back restores it.
  // The entry's own item is never new to the form, so it comes back to what
  // was recorded, or to what was typed over that.
  const drafts = useRef(new Map<string, Fills>());

  // Picking an item fills in its defaults and, for a test, one result per
  // analyte it reports.
  const pickItem = (nextId: string) => {
    const from = form.getValues("itemId");
    const next = items.find((candidate) => candidate.id === nextId);
    form.setValue("itemId", nextId, { shouldValidate: true });
    if (!next) return;
    const values = switchItem(
      drafts.current,
      pickFills(form.getValues()),
      from,
      nextId,
      fillsFor(next),
    );
    for (const field of FILLED_FIELDS[kind]) {
      form.setValue(field, values[field]);
    }
    if (kind === MedicalEntryKind.TEST) {
      form.setValue("results", values.results);
    }
    // The rabies fields are hidden for any other vaccine, so go with it.
    if (kind === MedicalEntryKind.VACCINE && !next.isRabies) {
      form.setValue("rabiesTagNumber", "");
      form.setValue("durationMonths", null);
    }
  };

  const onSubmit = (state: EntryFormState) => {
    const values = state as unknown as MedicalEntryFormValues;
    const durationIssue =
      values.kind === MedicalEntryKind.VACCINE
        ? rabiesDurationIssue(!!item?.isRabies, values.durationMonths)
        : null;
    if (durationIssue) {
      form.setError("durationMonths", { type: "manual", message: durationIssue });
      return;
    }

    startSubmitTransition(async () => {
      const payload = values as MedicalEntryFormInput;
      const result = entry
        ? await editMedicalEntry(entry.id, payload)
        : scheduled
          ? await recordScheduledMedicalEntry(scheduled.id, payload, report?.id)
          : await recordMedicalEntry(animalId, payload, report?.id);

      if (result.ok) {
        toast.success(
          !entry && values.scheduleNext && item
            ? `Recorded. Next ${item.name} due ${formatShelterDayOrNA(values.scheduleNext.dueDate)}.`
            : result.message,
        );
        onFormSubmit();
        return;
      }
      applyFieldErrors(form, result.fieldErrors as FieldErrors<EntryFormState>);
      toast.error(result.message);
    });
  };

  // The resolver files an error on the list itself under `root` once rows
  // exist; the server's lands on the list.
  const resultsError = form.formState.errors.results;
  const resultsErrorMessage =
    resultsError?.root?.message ?? resultsError?.message;
  // The service files a refusal of the next dose itself (already scheduled,
  // retired) on `scheduleNext`, and one of its day on the day.
  const scheduleNextErrorMessage = form.formState.errors.scheduleNext?.message;
  const noun = MEDICAL_ENTRY_KIND_LABELS[kind].toLowerCase();
  // Care scheduled during the stay was given then, never before intake.
  const sources = Object.values(MedicalEntrySource).filter(
    (value) => !scheduled || value !== MedicalEntrySource.BEFORE_INTAKE,
  );
  const latestNextDay = latestDueDate(options.today);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="itemId"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel htmlFor="itemId" required>
                  {MEDICAL_ENTRY_KIND_LABELS[kind]}
                </FormLabel>
                <Select
                  onValueChange={pickItem}
                  value={field.value}
                  name={field.name}
                >
                  <FormControl>
                    <SelectTrigger className="w-full" id="itemId">
                      <SelectValue placeholder={`Pick a ${noun}`} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {items.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    The catalog has no {noun} for this animal&apos;s species.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <GivenCareFields
            form={form}
            sources={sources}
            vetClinics={vetClinics}
            today={options.today}
          />

          {kind === MedicalEntryKind.VACCINE && (
            <>
              <MedicalTextField
                control={form.control}
                name="manufacturer"
                label="Manufacturer"
              />
              <MedicalRouteField control={form.control} name="route" />
              <MedicalTextField
                control={form.control}
                name="lotNumber"
                label="Lot number"
              />
              <DayField
                control={form.control}
                name="lotExpiryDate"
                label="Lot expiry"
                clearable
                triggerClassName="w-full"
              />
              <MedicalTextField
                control={form.control}
                name="site"
                label="Site"
                placeholder="e.g. Right shoulder"
              />
              {item?.isRabies && (
                <>
                  <MedicalTextField
                    control={form.control}
                    name="rabiesTagNumber"
                    label="Rabies tag number"
                  />
                  <NumberField
                    control={form.control}
                    name="durationMonths"
                    label="Duration (months)"
                    required
                    min={1}
                    max={36}
                    placeholder="12 or 36"
                  />
                </>
              )}
            </>
          )}

          {kind === MedicalEntryKind.TEST && (
            <>
              <MedicalTextField
                control={form.control}
                name="lotNumber"
                label="Kit lot number"
              />
              <DayField
                control={form.control}
                name="lotExpiryDate"
                label="Kit lot expiry"
                clearable
                triggerClassName="w-full"
              />
              <fieldset className="space-y-2 md:col-span-2">
                <legend className="text-sm font-medium">
                  Results <span className="text-destructive">*</span>
                </legend>
                {results.fields.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Pick a test to enter its results.
                  </p>
                )}
                {results.fields.map((row, index) => (
                  <FormField
                    key={row.key}
                    control={form.control}
                    name={`results.${index}.result`}
                    render={({ field }) => (
                      <FormItem className="grid grid-cols-2 items-center gap-2">
                        <FormLabel htmlFor={`result-${index}`}>
                          {row.analyteName}
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                          name={field.name}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full" id={`result-${index}`}>
                              <SelectValue placeholder="Choose a result" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.values(TestResult).map((value) => (
                              <SelectItem key={value} value={value}>
                                {TEST_RESULT_LABELS[value]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage className="col-span-2" />
                      </FormItem>
                    )}
                  />
                ))}
                {resultsErrorMessage && (
                  <p className="text-sm text-destructive">{resultsErrorMessage}</p>
                )}
              </fieldset>
            </>
          )}

          {kind === MedicalEntryKind.TREATMENT && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  control={form.control}
                  name="doseAmount"
                  label="Dose"
                  decimal
                  min={0}
                />
                <DoseUnitField control={form.control} name="doseUnit" />
              </div>
              <MedicalRouteField control={form.control} name="route" />
            </>
          )}

          {nextItem && (
            <fieldset className="space-y-3 rounded-lg border p-4 md:col-span-2">
              <legend className="sr-only">Next dose</legend>
              <FormField
                control={form.control}
                name="scheduleNextOn"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(!!checked)}
                    />
                    Schedule the next one
                  </label>
                )}
              />
              <p className="text-sm text-muted-foreground">
                {nextItem.name} repeats every {nextItem.repeatIntervalDays}{" "}
                {nextItem.repeatIntervalDays === 1 ? "day" : "days"}.
              </p>
              {scheduleNextOn && (
                <DayField
                  control={form.control}
                  name="scheduleNext.dueDate"
                  label="Next due date"
                  required
                  className="md:max-w-xs"
                  triggerClassName="w-full"
                  disabledDates={(date) => {
                    const day = format(date, "yyyy-MM-dd");
                    return day < options.today || day > latestNextDay;
                  }}
                />
              )}
              {scheduleNextErrorMessage && (
                <p className="text-sm text-destructive">
                  {scheduleNextErrorMessage}
                </p>
              )}
            </fieldset>
          )}

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel htmlFor="notes">Notes</FormLabel>
                <FormControl>
                  <Textarea id="notes" {...field} />
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
            {entry ? "Save Changes" : `Record ${MEDICAL_ENTRY_KIND_LABELS[kind]}`}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
