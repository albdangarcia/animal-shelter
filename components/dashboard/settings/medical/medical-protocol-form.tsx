"use client";

import { useImperativeHandle, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Path,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { NumberField } from "@/components/forms/number-field";
import {
  ExamType,
  MedicalProtocolStepKind,
} from "@/prisma/generated/enums";
import type {
  MedicalProtocolListing,
  ProtocolStepItem,
} from "@/app/lib/data/medical-protocol";
import {
  createMedicalProtocol,
  updateMedicalProtocol,
} from "@/app/lib/actions/medical-protocol.actions";
import {
  MedicalProtocolFormSchema,
  type MedicalProtocolFormInput,
  type MedicalProtocolFormValues,
} from "@/app/lib/zod-schemas/medical-protocol.schemas";
import {
  EXAM_TYPE_LABELS,
  MAX_PROTOCOL_NOT_BEFORE_AGE_DAYS,
  MAX_PROTOCOL_OFFSET_DAYS,
  MAX_PROTOCOL_STEP_DOSES,
  MEDICAL_PROTOCOL_STEP_KIND_LABELS,
} from "@/app/lib/constants/medical";
import { MAX_REPEAT_INTERVAL_DAYS } from "@/app/lib/utils/medical-days";
import {
  protocolAgesText,
  protocolStepTimingText,
  speciesPlural,
} from "@/app/lib/utils/medical-protocol-text";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
} from "@/hooks/use-confirmed-open-change";

type StepInput = MedicalProtocolFormInput["steps"][number];

const STEP_KINDS = Object.values(MedicalProtocolStepKind);
const EXAM_TYPES = Object.values(ExamType);

const CATALOG_KINDS: readonly MedicalProtocolStepKind[] = [
  MedicalProtocolStepKind.VACCINE,
  MedicalProtocolStepKind.TEST,
  MedicalProtocolStepKind.TREATMENT,
];
const isCatalogKind = (kind: MedicalProtocolStepKind) => CATALOG_KINDS.includes(kind);

/** The form's handle: whether it was changed, and whether it is saving (its
 * dialog doesn't close under a save). */
export interface MedicalProtocolFormHandle extends DirtyFormHandle {
  isPending: () => boolean;
}

interface Props {
  protocol?: MedicalProtocolListing;
  species: { id: string; name: string }[];
  items: ProtocolStepItem[];
  onFormSubmit: () => void;
  ref?: React.Ref<MedicalProtocolFormHandle>;
}

const blankStep = (kind: MedicalProtocolStepKind): StepInput => ({
  id: null,
  kind,
  itemId: null,
  examType: kind === MedicalProtocolStepKind.EXAM ? ExamType.INTAKE : null,
  offsetDays: 0,
  notBeforeAgeDays: null,
  repeatIntervalDays: null,
  repeatCount: null,
  untilAgeDays: null,
  notes: "",
});

const defaultValues = (protocol?: MedicalProtocolListing): MedicalProtocolFormInput =>
  protocol
    ? {
        name: protocol.name,
        speciesId: protocol.speciesId,
        minAgeDays: protocol.minAgeDays,
        maxAgeDays: protocol.maxAgeDays,
        // Sent back with its id, a step whose fields are left as they are is
        // kept; one that changed is retired and saved anew.
        steps: protocol.steps.map((step) => ({
          id: step.id,
          kind: step.kind,
          itemId: step.item?.id ?? null,
          examType: step.examType,
          offsetDays: step.offsetDays,
          notBeforeAgeDays: step.notBeforeAgeDays,
          repeatIntervalDays: step.repeatIntervalDays,
          repeatCount: step.repeatCount,
          untilAgeDays: step.untilAgeDays,
          notes: step.notes ?? "",
        })),
      }
    : {
        name: "",
        speciesId: "",
        minAgeDays: null,
        maxAgeDays: null,
        steps: [blankStep(MedicalProtocolStepKind.EXAM)],
      };

const isWholeOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);

/** Saves a protocol: its name, species, ages and its whole step list. */
export function MedicalProtocolForm({ protocol, species, items, onFormSubmit, ref }: Props) {
  const router = useRouter();
  const [isPending, startSubmitTransition] = useTransition();

  const form = useForm<MedicalProtocolFormInput, unknown, MedicalProtocolFormValues>({
    resolver: standardSchemaResolver(MedicalProtocolFormSchema),
    defaultValues: defaultValues(protocol),
  });
  const steps = useFieldArray({
    control: form.control,
    name: "steps",
    // The rows carry their own `id`, so the array's React key lives elsewhere.
    keyName: "key",
  });
  const speciesId = useWatch({ control: form.control, name: "speciesId" });
  const minAgeDays = useWatch({ control: form.control, name: "minAgeDays" });
  const maxAgeDays = useWatch({ control: form.control, name: "maxAgeDays" });
  const watchedSteps = useWatch({ control: form.control, name: "steps" });

  const initialValuesRef = useRef(form.getValues());
  useImperativeHandle(
    ref,
    () => ({
      isDirty: () => haveFormValuesChanged(form.getValues(), initialValuesRef.current),
      isPending: () => isPending,
    }),
    [form, isPending],
  );

  // A protocol of a species since retired keeps it on its own form.
  const speciesOptions =
    protocol && !species.some((option) => option.id === protocol.speciesId)
      ? [...species, { id: protocol.speciesId, name: protocol.speciesName }]
      : species;
  const speciesName = speciesOptions.find((option) => option.id === speciesId)?.name;

  // The items this protocol's steps name now, retired or narrowed since
  // included, so a step saved with one still shows it.
  const storedItems = new Map(
    (protocol?.steps ?? []).flatMap((step) => (step.item ? [[step.item.id, step.item]] : [])),
  );
  const liveItems = new Map(items.map((item) => [item.id, item]));
  const fitsSpecies = (speciesIds: string[]) =>
    !speciesId || speciesIds.length === 0 || speciesIds.includes(speciesId);

  const itemName = (itemId: string | null | undefined) =>
    itemId ? (liveItems.get(itemId)?.name ?? storedItems.get(itemId)?.name) : undefined;

  const itemOptions = (kind: MedicalProtocolStepKind, current: string | null | undefined) => {
    const options = items
      .filter((item) => item.kind === kind && fitsSpecies(item.speciesIds))
      .map((item) => ({ value: item.id, label: item.name }));
    if (current && !options.some((option) => option.value === current)) {
      const live = liveItems.get(current);
      const stored = storedItems.get(current);
      const name = live?.name ?? stored?.name;
      if (name) {
        const why =
          !live || stored?.retired
            ? "retired"
            : `not for ${speciesName ? speciesPlural(speciesName) : "this species"}`;
        options.push({ value: current, label: `${name} (${why})` });
      }
    }
    return options;
  };

  /** What a step is called on its buttons and its heading. */
  const stepName = (step: StepInput | undefined) => {
    if (!step) return "New";
    if (isCatalogKind(step.kind)) {
      return itemName(step.itemId) ?? MEDICAL_PROTOCOL_STEP_KIND_LABELS[step.kind];
    }
    if (step.kind === MedicalProtocolStepKind.EXAM) {
      return step.examType ? EXAM_TYPE_LABELS[step.examType] : "Exam";
    }
    return MEDICAL_PROTOCOL_STEP_KIND_LABELS[step.kind];
  };
  const names = steps.fields.map((_, index) => stepName(watchedSteps?.[index]));
  // "DHPP step", or "DHPP step 2" when two steps share a name.
  const stepLabel = (index: number) =>
    names.filter((name) => name === names[index]).length > 1
      ? `${names[index]} step ${index + 1}`
      : `${names[index]} step`;

  // A step's other kinds' fields are hidden, so their values go too: a hidden
  // value would fail validation with nowhere to show the message.
  const changeKind = (index: number, kind: MedicalProtocolStepKind) => {
    const set = (field: keyof StepInput, value: unknown) =>
      form.setValue(`steps.${index}.${field}` as Path<MedicalProtocolFormInput>, value as never, {
        shouldDirty: true,
      });
    set("kind", kind);
    set("itemId", null);
    set("examType", kind === MedicalProtocolStepKind.EXAM ? ExamType.INTAKE : null);
    if (!isCatalogKind(kind)) {
      set("repeatIntervalDays", null);
      set("repeatCount", null);
      set("untilAgeDays", null);
    }
  };

  const onSubmit = (values: MedicalProtocolFormValues) => {
    startSubmitTransition(async () => {
      const result = protocol
        ? await updateMedicalProtocol(protocol.id, values)
        : await createMedicalProtocol(values);

      if (result.ok) {
        toast.success(result.message);
        onFormSubmit();
        return;
      }

      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
      // Refused for a reason other than the form's, most likely because
      // someone retired it first. Refreshing shows it as it now is.
      if (!result.fieldErrors) router.refresh();
    });
  };

  const covers =
    speciesName && isWholeOrNull(minAgeDays) && isWholeOrNull(maxAgeDays) &&
    (minAgeDays === null || maxAgeDays === null || maxAgeDays > minAgeDays)
      ? protocolAgesText(speciesName, minAgeDays, maxAgeDays)
      : null;

  // The resolver files an error on the list itself under `root` once rows
  // exist; the server's lands on the list.
  const stepsError = form.formState.errors.steps;
  const stepsErrorMessage = stepsError?.root?.message ?? stepsError?.message;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Nothing changes while a save is out: its refusals are keyed by
            each step's place in the list, so a step moved, removed or
            changed meanwhile would take another step's message. A disabled
            fieldset doesn't stop a Radix select from opening, so each select
            is disabled too. */}
        <fieldset disabled={isPending} className="m-0 min-w-0 space-y-6 border-0 p-0">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="name" required>
                    Name
                  </FormLabel>
                  <FormControl>
                    <Input id="name" placeholder="e.g. Puppy" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="speciesId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="speciesId" required>
                    Species
                  </FormLabel>
                  <Select
                    disabled={isPending}
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                    name={field.name}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" id="speciesId">
                        <SelectValue placeholder="Pick a species" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {speciesOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <NumberField
              control={form.control}
              name="minAgeDays"
              label="From age (days)"
              min={0}
              placeholder="Birth"
            />
            <NumberField
              control={form.control}
              name="maxAgeDays"
              label="Under age (days)"
              min={1}
              placeholder="No limit"
            />
            <p className="text-sm text-muted-foreground md:col-span-2">
              An animal&apos;s age on its intake day picks the protocol: from the
              first age, and under the second. Leave either empty for from
              birth, or for life. Two live protocols of a species can&apos;t
              cover the same age.
              {covers && <> Covers: {covers}.</>}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">
              Steps <span className="text-destructive">*</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Each step&apos;s first dose is due its days after intake, and not
              before its earliest age, nor before the day the animal arrives.
            </p>
            {steps.fields.map((row, index) => {
              const step = watchedSteps?.[index] ?? row;
              const catalog = isCatalogKind(step.kind);
              const label = stepLabel(index);
              const timing =
                typeof step.offsetDays === "number"
                  ? protocolStepTimingText({
                      offsetDays: step.offsetDays,
                      notBeforeAgeDays: step.notBeforeAgeDays ?? null,
                      repeatIntervalDays: step.repeatIntervalDays ?? null,
                      repeatCount: step.repeatCount ?? null,
                      untilAgeDays: step.untilAgeDays ?? null,
                    })
                  : null;
              const field = (name: keyof StepInput) =>
                `steps.${index}.${name}` as Path<MedicalProtocolFormInput>;
              return (
                <div
                  key={row.key}
                  role="group"
                  aria-labelledby={`step-${row.key}-title`}
                  className="space-y-3 rounded-lg border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <p id={`step-${row.key}-title`} className="font-medium">
                        Step {index + 1}: {names[index]}
                      </p>
                      {timing && <p className="text-muted-foreground">{timing}</p>}
                    </div>
                    <div className="flex shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${label} up`}
                        disabled={index === 0}
                        onClick={() => steps.move(index, index - 1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${label} down`}
                        disabled={index === steps.fields.length - 1}
                        onClick={() => steps.move(index, index + 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${label}`}
                        onClick={() => steps.remove(index)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name={`steps.${index}.kind`}
                      render={({ field: kindField }) => (
                        <FormItem>
                          <FormLabel htmlFor={`steps.${index}.kind`} required>
                            Kind
                          </FormLabel>
                          <Select
                            disabled={isPending}
                            onValueChange={(value) =>
                              changeKind(index, value as MedicalProtocolStepKind)
                            }
                            value={kindField.value}
                            name={kindField.name}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full" id={`steps.${index}.kind`}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {STEP_KINDS.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {MEDICAL_PROTOCOL_STEP_KIND_LABELS[value]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {catalog && (
                      <FormField
                        control={form.control}
                        name={`steps.${index}.itemId`}
                        render={({ field: itemField }) => {
                          const options = itemOptions(step.kind, itemField.value);
                          return (
                            <FormItem className="md:col-span-2">
                              <FormLabel htmlFor={`steps.${index}.itemId`} required>
                                {MEDICAL_PROTOCOL_STEP_KIND_LABELS[step.kind]}
                              </FormLabel>
                              <Select
                                disabled={isPending}
                                onValueChange={itemField.onChange}
                                value={itemField.value ?? ""}
                                name={itemField.name}
                              >
                                <FormControl>
                                  <SelectTrigger
                                    className="w-full"
                                    id={`steps.${index}.itemId`}
                                  >
                                    <SelectValue placeholder="Pick from the catalog" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {options.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {options.length === 0 && (
                                <FormDescription>
                                  The catalog has none
                                  {speciesName ? ` for ${speciesPlural(speciesName)}` : ""}.
                                </FormDescription>
                              )}
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    )}

                    {step.kind === MedicalProtocolStepKind.EXAM && (
                      <FormField
                        control={form.control}
                        name={`steps.${index}.examType`}
                        render={({ field: examField }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel htmlFor={`steps.${index}.examType`} required>
                              Exam type
                            </FormLabel>
                            <Select
                              disabled={isPending}
                              onValueChange={examField.onChange}
                              value={examField.value ?? ""}
                              name={examField.name}
                            >
                              <FormControl>
                                <SelectTrigger
                                  className="w-full"
                                  id={`steps.${index}.examType`}
                                >
                                  <SelectValue placeholder="Pick the exam" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {EXAM_TYPES.map((value) => (
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
                    )}

                    <NumberField
                      control={form.control}
                      name={field("offsetDays")}
                      label="Days after intake"
                      required
                      min={0}
                      max={MAX_PROTOCOL_OFFSET_DAYS}
                    />
                    <NumberField
                      control={form.control}
                      name={field("notBeforeAgeDays")}
                      label="Not before age (days)"
                      min={0}
                      max={MAX_PROTOCOL_NOT_BEFORE_AGE_DAYS}
                      placeholder="Any age"
                    />

                    {catalog && (
                      <>
                        <NumberField
                          control={form.control}
                          name={field("repeatIntervalDays")}
                          label="Repeat every (days)"
                          min={1}
                          max={MAX_REPEAT_INTERVAL_DAYS}
                          placeholder="Once"
                        />
                        <NumberField
                          control={form.control}
                          name={field("repeatCount")}
                          label="Doses after the first"
                          min={1}
                          max={MAX_PROTOCOL_STEP_DOSES - 1}
                        />
                        <NumberField
                          control={form.control}
                          name={field("untilAgeDays")}
                          label="Only under age (days)"
                          min={1}
                        />
                      </>
                    )}

                    <FormField
                      control={form.control}
                      name={`steps.${index}.notes`}
                      render={({ field: notesField }) => (
                        <FormItem className="sm:col-span-2 md:col-span-3">
                          <FormLabel htmlFor={`steps.${index}.notes`}>Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              id={`steps.${index}.notes`}
                              rows={2}
                              {...notesField}
                              value={notesField.value ?? ""}
                            />
                          </FormControl>
                          <FormDescription>
                            Copied onto each entry the step schedules.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              );
            })}
            {stepsErrorMessage && (
              <p className="text-sm text-destructive">{stepsErrorMessage}</p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => steps.append(blankStep(MedicalProtocolStepKind.VACCINE))}
            >
              <Plus className="mr-2 size-4" />
              Add step
            </Button>
          </div>
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
                {protocol ? "Updating..." : "Creating..."}
              </>
            ) : protocol ? (
              "Update Protocol"
            ) : (
              "Create Protocol"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
