"use client";

import { useImperativeHandle, useRef, useTransition } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  MedicalEntryFormOptions,
  PickableMedicalItem,
} from "@/app/lib/data/medical-catalog.data";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import {
  editMedicalEntry,
  recordMedicalEntry,
} from "@/app/lib/actions/medical-entry.actions";
import {
  MedicalEntryFormSchema,
  rabiesDurationIssue,
  type MedicalEntryFormInput,
  type MedicalEntryFormValues,
} from "@/app/lib/zod-schemas/medical-entry.schemas";
import {
  DOSE_UNIT_LABELS,
  MEDICAL_ENTRY_SOURCE_LABELS,
  MEDICAL_ITEM_KIND_LABELS,
  MEDICAL_ROUTE_LABELS,
  TEST_RESULT_LABELS,
} from "@/app/lib/constants/medical";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import { switchItem } from "@/app/lib/utils/medical-item-fills";
import type { FieldErrors } from "@/app/lib/action-result";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";

const NONE = "none";

/**
 * The form's own state: every kind's fields at once, flat, so one form serves
 * all three kinds. The schema validates the kind's fields and drops the rest.
 * `dateUnknown` is the form's alone.
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
};

const fromEntry = (entry: MedicalEntryDisplay): EntryFormState => ({
  kind: entry.kind,
  itemId: entry.itemId,
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
});

/**
 * The items this entry can pick. An entry being edited keeps its own item
 * even when that item has since been retired or narrowed to other species,
 * held to what it was recorded with: the results it was recorded with, and
 * the rabies fields only if it was recorded as a rabies vaccine, whatever the
 * catalog says now.
 */
const itemChoices = (
  kind: MedicalEntryKind,
  options: MedicalEntryFormOptions,
  entry?: MedicalEntryDisplay,
): PickableMedicalItem[] => {
  const ofKind = options.items.filter((item) => item.kind === kind);
  if (!entry) return ofKind;
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
      analytes: recordedAnalytes,
    },
    ...others,
  ].sort((a, b) => a.name.localeCompare(b.name));
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
const fillsFor = (item: PickableMedicalItem): Fills => ({
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
  animalId: string;
  kind: MedicalEntryKind;
  options: MedicalEntryFormOptions;
  /** Present when editing. */
  entry?: MedicalEntryDisplay;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

export function MedicalEntryForm({
  animalId,
  kind,
  options,
  entry,
  onFormSubmit,
  ref,
}: Props) {
  const [isPending, startSubmitTransition] = useTransition();
  const items = itemChoices(kind, options, entry);
  const vetClinics =
    entry?.vetPartnerId &&
    entry.vetPartner &&
    !options.vetClinics.some((clinic) => clinic.id === entry.vetPartnerId)
      ? [...options.vetClinics, { id: entry.vetPartnerId, name: entry.vetPartner.name }]
      : options.vetClinics;

  const form = useForm<EntryFormState>({
    // The schema reads the flat state as the kind's shape and drops the
    // fields that kind doesn't have, so what reaches onSubmit is the
    // schema's output, not this state.
    resolver: standardSchemaResolver(
      MedicalEntryFormSchema,
    ) as unknown as Resolver<EntryFormState>,
    defaultValues: entry ? fromEntry(entry) : blank(kind, options.today),
  });
  const results = useFieldArray({
    control: form.control,
    name: "results",
    keyName: "key",
  });
  const [itemId, source, dateUnknown] = useWatch({
    control: form.control,
    name: ["itemId", "source", "dateUnknown"],
  });
  const item = items.find((candidate) => candidate.id === itemId);

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () =>
        haveFormValuesChanged(form.getValues(), initialValuesRef.current),
    }),
    [form],
  );

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

  // Care in the shelter has no outside vet, and only care before intake can
  // have an unknown day: the hidden fields go with the choice.
  const pickSource = (next: MedicalEntrySource) => {
    form.setValue("source", next);
    if (next === MedicalEntrySource.IN_HOUSE) {
      form.setValue("vetPartnerId", null);
      form.setValue("vetName", "");
    }
    if (next !== MedicalEntrySource.BEFORE_INTAKE && form.getValues("dateUnknown")) {
      form.setValue("dateUnknown", false);
      form.setValue("completedDate", options.today);
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
        : await recordMedicalEntry(animalId, payload);

      if (result.ok) {
        toast.success(result.message);
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
  const noun = MEDICAL_ITEM_KIND_LABELS[kind].toLowerCase();

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
                  {MEDICAL_ITEM_KIND_LABELS[kind]}
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

          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel id="source-label" required>
                  Given
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    aria-labelledby="source-label"
                    value={field.value}
                    onValueChange={(value) =>
                      pickSource(value as MedicalEntrySource)
                    }
                    className="flex flex-wrap gap-4"
                  >
                    {Object.values(MedicalEntrySource).map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={value} />
                        {MEDICAL_ENTRY_SOURCE_LABELS[value]}
                      </label>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            {dateUnknown ? (
              <FormItem>
                <FormLabel htmlFor="completedDate">Date given</FormLabel>
                <Input id="completedDate" value="Unknown" disabled />
              </FormItem>
            ) : (
              <DayField
                control={form.control}
                name="completedDate"
                label="Date given"
                required
                triggerClassName="w-full"
                disabledDates={(date) => format(date, "yyyy-MM-dd") > options.today}
              />
            )}
            {source === MedicalEntrySource.BEFORE_INTAKE && (
              <FormField
                control={form.control}
                name="dateUnknown"
                render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(!!checked);
                        form.setValue(
                          "completedDate",
                          checked ? null : options.today,
                        );
                      }}
                    />
                    Date unknown
                  </label>
                )}
              />
            )}
          </div>

          {source !== MedicalEntrySource.IN_HOUSE && (
            <>
              <FormField
                control={form.control}
                name="vetPartnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="vetPartnerId">Vet clinic</FormLabel>
                    <Select
                      onValueChange={(value) =>
                        field.onChange(value === NONE ? null : value)
                      }
                      value={field.value ?? NONE}
                      name={field.name}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full" id="vetPartnerId">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not a partner clinic</SelectItem>
                        {vetClinics.map((clinic) => (
                          <SelectItem key={clinic.id} value={clinic.id}>
                            {clinic.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <TextField form={form} name="vetName" label="Vet or clinic name" />
            </>
          )}

          {kind === MedicalEntryKind.VACCINE && (
            <>
              <TextField form={form} name="manufacturer" label="Manufacturer" />
              <RouteField form={form} />
              <TextField form={form} name="lotNumber" label="Lot number" />
              <DayField
                control={form.control}
                name="lotExpiryDate"
                label="Lot expiry"
                clearable
                triggerClassName="w-full"
              />
              <TextField form={form} name="site" label="Site" placeholder="e.g. Right shoulder" />
              {item?.isRabies && (
                <>
                  <TextField form={form} name="rabiesTagNumber" label="Rabies tag number" />
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
              <TextField form={form} name="lotNumber" label="Kit lot number" />
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
                <FormField
                  control={form.control}
                  name="doseUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="doseUnit">Unit</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === NONE ? null : value)
                        }
                        value={field.value ?? NONE}
                        name={field.name}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full" id="doseUnit">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>None</SelectItem>
                          {Object.values(DoseUnit).map((value) => (
                            <SelectItem key={value} value={value}>
                              {DOSE_UNIT_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <RouteField form={form} />
            </>
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
            {entry ? "Save Changes" : `Record ${MEDICAL_ITEM_KIND_LABELS[kind]}`}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

type EntryForm = UseFormReturn<EntryFormState>;

type TextFieldName =
  | "vetName"
  | "manufacturer"
  | "lotNumber"
  | "site"
  | "rabiesTagNumber";

function TextField({
  form,
  name,
  label,
  placeholder,
}: {
  form: EntryForm;
  name: TextFieldName;
  label: string;
  placeholder?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={name}>{label}</FormLabel>
          <FormControl>
            <Input id={name} placeholder={placeholder} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function RouteField({ form }: { form: EntryForm }) {
  return (
    <FormField
      control={form.control}
      name="route"
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor="route">Route</FormLabel>
          <Select
            onValueChange={(value) => field.onChange(value === NONE ? null : value)}
            value={field.value ?? NONE}
            name={field.name}
          >
            <FormControl>
              <SelectTrigger className="w-full" id="route">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NONE}>Not recorded</SelectItem>
              {Object.values(MedicalRoute).map((value) => (
                <SelectItem key={value} value={value}>
                  {MEDICAL_ROUTE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
