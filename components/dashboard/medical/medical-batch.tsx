"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HelpLink } from "@/components/dashboard/help/help-link";
import type { HelpLinkGuide } from "@/app/lib/guides/help-paths";
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
import { DayField } from "@/components/forms/day-field";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import type {
  MedicalBatchAnimal,
  MedicalBatchAnimalGroup,
  MedicalBatchAnimalSet,
  MedicalBatchOptions,
} from "@/app/lib/data/medical-batch.data";
import { animalsOfGroup } from "@/app/lib/data/medical-batch-groups";
import { recordMedicalBatch } from "@/app/lib/actions/medical-entry.actions";
import type { MedicalBatchAnimalRefusal } from "@/app/lib/services/medical-batch";
import {
  MedicalBatchSchema,
  medicalEntryFieldErrors,
  rabiesDurationIssue,
  type MedicalBatchFormInput,
} from "@/app/lib/zod-schemas/medical-entry.schemas";
import {
  MAX_BATCH_SIZE,
  MEDICAL_ENTRY_KIND_LABELS,
} from "@/app/lib/constants/medical";
import { latestDueDate } from "@/app/lib/utils/medical-days";
import {
  animalsItemIsNotFor,
  batchAnimalLabels,
  batchSizeIssue,
} from "@/app/lib/utils/medical-batch";
import {
  BatchGivenFields,
  applyBatchFieldErrors,
  batchGivenValues,
  batchItemFills,
  blankBatchForm,
  offersNextDose,
  submitBatchForm,
  type BatchFormState,
} from "./batch-given-fields";
import { BatchRefusals } from "./batch-refusals";

export const MEDICAL_BATCH_TITLE = "Batch Entry";
export const MEDICAL_BATCH_DESCRIPTION = `Give or schedule one vaccine or treatment for several animals at once: a room, a litter, a foster home. Up to ${MAX_BATCH_SIZE} animals. Tests are recorded one at a time.`;

const BATCH_KINDS = [MedicalEntryKind.VACCINE, MedicalEntryKind.TREATMENT] as const;
type BatchKind = (typeof BATCH_KINDS)[number];

const ALL_SPECIES = "all";

const GROUP_LABELS: Record<MedicalBatchAnimalGroup["type"], string | null> = {
  LOCATION: "Location",
  FOSTER: "In foster with",
  NOT_HOUSED: null,
};

export function MedicalBatch({
  options,
  help,
}: {
  options: MedicalBatchOptions;
  /** The guide the "?" opens, or null for no "?". */
  help: HelpLinkGuide | null;
}) {
  const { groups, species, items, vetClinics, today } = options;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [speciesId, setSpeciesId] = useState(ALL_SPECIES);
  const [animalsError, setAnimalsError] = useState<string>();
  const [refusals, setRefusals] = useState<MedicalBatchAnimalRefusal[]>([]);
  // Remounts the care fields after a save, so the next dose's day starts
  // following the day given again.
  const [formKey, setFormKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  const form = useForm<BatchFormState>({ defaultValues: blankBatchForm(today) });
  const [mode, kind, itemId] = useWatch({
    control: form.control,
    name: ["mode", "kind", "itemId"],
  });
  const item = items.find((candidate) => candidate.id === itemId);
  const kindItems = items.filter((candidate) => candidate.kind === kind);

  // Every animal, in checklist order, so the picked ones keep that order.
  const allAnimals = useMemo(() => groups.flatMap(animalsOfGroup), [groups]);
  // Told apart by their details when two animals in care share a name.
  const labels = useMemo(
    () =>
      batchAnimalLabels(
        allAnimals.map((animal) => ({ ...animal, species: animal.species.name })),
        today,
      ),
    [allAnimals, today],
  );
  const labelOf = (animalId: string) => labels.get(animalId) ?? "An animal";
  const picked = allAnimals.filter((animal) => selected.has(animal.id));
  const notFor = animalsItemIsNotFor(item, picked);
  const shown = (animal: MedicalBatchAnimal) =>
    speciesId === ALL_SPECIES || animal.species.id === speciesId;

  const toggle = (animals: MedicalBatchAnimal[], on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const animal of animals) {
        if (on) next.add(animal.id);
        else next.delete(animal.id);
      }
      return next;
    });
    setAnimalsError(undefined);
    setRefusals([]);
  };

  const pickKind = (next: BatchKind) => {
    form.setValue("kind", next);
    form.setValue("itemId", "");
    form.clearErrors("kind");
  };

  const pickItem = (nextId: string) => {
    form.setValue("itemId", nextId);
    form.clearErrors("itemId");
    const fills = batchItemFills(items.find((candidate) => candidate.id === nextId));
    for (const [field, value] of Object.entries(fills)) {
      form.setValue(field as keyof typeof fills, value);
    }
  };

  const onSubmit = (state: BatchFormState) => {
    setRefusals([]);
    setAnimalsError(undefined);
    const sizeIssue = batchSizeIssue(picked.length);
    if (sizeIssue) {
      setAnimalsError(sizeIssue);
      return;
    }
    const batchKind = (state.kind || undefined) as BatchKind | undefined;
    const animals = picked.map((animal) => ({
      animalId: animal.id,
      rabiesTagNumber: item?.isRabies ? (state.tags[animal.id] ?? "") : null,
    }));
    const payload = (
      state.mode === "SCHEDULE"
        ? {
            mode: "SCHEDULE",
            animals,
            kind: batchKind,
            itemId: state.itemId,
            dueDate: state.dueDate ?? "",
            notes: state.notes,
          }
        : {
            mode: "RECORD",
            animals,
            itemId: state.itemId,
            ...batchGivenValues(
              state,
              batchKind ?? MedicalEntryKind.VACCINE,
              offersNextDose(item),
            ),
            kind: batchKind,
          }
    ) as MedicalBatchFormInput;

    // Checked as the server checks them, so the refusal comes before
    // anything is sent.
    const parsed = MedicalBatchSchema.safeParse(payload);
    const durationIssue =
      state.mode === "RECORD" && batchKind === MedicalEntryKind.VACCINE
        ? rabiesDurationIssue(!!item?.isRabies, state.durationMonths)
        : null;
    if (!parsed.success || durationIssue) {
      if (!parsed.success) {
        setAnimalsError(
          applyBatchFieldErrors(form, medicalEntryFieldErrors(parsed.error), "animals"),
        );
      }
      if (durationIssue) {
        form.setError("durationMonths", { type: "manual", message: durationIssue });
      }
      return;
    }

    startTransition(async () => {
      const result = await recordMedicalBatch(payload);
      if (result.ok) {
        toast.success(result.message);
        setSelected(new Set());
        form.reset({ ...blankBatchForm(today), mode: state.mode });
        setFormKey((key) => key + 1);
        return;
      }
      toast.error(result.message);
      if ("refusals" in result && result.refusals) setRefusals(result.refusals);
      setAnimalsError(
        applyBatchFieldErrors(
          form,
          (result.fieldErrors ?? {}) as Record<string, string[]>,
          "animals",
        ),
      );
    });
  };

  const latest = latestDueDate(today);
  const count = picked.length;
  const tooMany = count > MAX_BATCH_SIZE;
  const verb = mode === "SCHEDULE" ? "Schedule" : "Record";

  return (
    <Card className="@container/main">
      <CardHeader>
        <CardTitle className="@[650px]/main:text-xl">
          <h1>{MEDICAL_BATCH_TITLE}</h1>
        </CardTitle>
        {help && (
          <CardAction>
            <HelpLink guide={help} />
          </CardAction>
        )}
        <CardDescription>{MEDICAL_BATCH_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={submitBatchForm(form, onSubmit)}
            className="grid grid-cols-1 gap-6 lg:grid-cols-2"
          >
            <section aria-labelledby="batch-animals" className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 id="batch-animals" className="text-lg font-semibold">
                  Animals
                </h2>
                <div className="flex items-center gap-2">
                  <label htmlFor="batch-species" className="text-sm">
                    Species
                  </label>
                  <Select value={speciesId} onValueChange={setSpeciesId}>
                    <SelectTrigger id="batch-species" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_SPECIES}>All species</SelectItem>
                      {species.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <PickedSummary
                picked={picked.map((animal) => labelOf(animal.id))}
                tooMany={tooMany}
                error={animalsError}
                onClear={() => toggle(picked, false)}
              />
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No animals are in the shelter&apos;s care.
                </p>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <AnimalGroup
                      key={group.key}
                      group={group}
                      selected={selected}
                      shown={shown}
                      onToggle={toggle}
                      labelOf={labelOf}
                    />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="batch-care" className="space-y-4">
              <h2 id="batch-care" className="text-lg font-semibold">
                Care
              </h2>
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel id="batch-mode-label" required>
                      This care is
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        aria-labelledby="batch-mode-label"
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex flex-wrap gap-4"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value="RECORD" />
                          Given
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem value="SCHEDULE" />
                          Scheduled
                        </label>
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="kind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="batch-kind" required>
                        Kind
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => pickKind(value as BatchKind)}
                        name={field.name}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full" id="batch-kind">
                            <SelectValue placeholder="Vaccine or treatment" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BATCH_KINDS.map((value) => (
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
                      <FormLabel htmlFor="batch-item" required>
                        Item
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={pickItem}
                        name={field.name}
                        disabled={!kind}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full" id="batch-item">
                            <SelectValue
                              placeholder={kind ? "Pick an item" : "Pick a kind first"}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {kindItems.map((option) => (
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
              </div>
              {item && notFor.length > 0 && (
                <p role="status" className="text-sm text-destructive">
                  {item.name} isn&apos;t for{" "}
                  {notFor.map((animal) => labelOf(animal.id)).join(", ")}. Unpick{" "}
                  {notFor.length === 1 ? "it" : "them"}, or the batch is refused.
                </p>
              )}

              {mode === "SCHEDULE" ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                        <FormLabel htmlFor="notes">Notes</FormLabel>
                        <FormControl>
                          <Textarea id="notes" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                kind && (
                  <BatchGivenFields
                    key={formKey}
                    form={form}
                    kind={kind as BatchKind}
                    item={item}
                    vetClinics={vetClinics}
                    today={today}
                    tagged={picked.map((animal) => ({
                      key: animal.id,
                      label: labelOf(animal.id),
                    }))}
                  />
                )
              )}

              <BatchRefusals
                refusals={refusals}
                labelOf={(refusal) => labelOf(refusal.animalId)}
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={isPending || count === 0 || tooMany}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {count === 0
                    ? `${verb} for the animals picked`
                    : `${verb} for ${count} ${count === 1 ? "animal" : "animals"}`}
                </Button>
              </div>
            </section>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function PickedSummary({
  picked,
  tooMany,
  error,
  onClear,
}: {
  /** The picked animals' labels. */
  picked: string[];
  tooMany: boolean;
  error: string | undefined;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1 rounded-lg border p-3 text-sm" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {picked.length === 0
            ? "No animals picked yet."
            : `${picked.length} ${picked.length === 1 ? "animal" : "animals"} picked`}
        </p>
        {picked.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      {picked.length > 0 && (
        <p className="text-muted-foreground">
          {picked.join(", ")}
        </p>
      )}
      {tooMany && (
        <p className="text-destructive">
          A batch can cover at most {MAX_BATCH_SIZE} animals.
        </p>
      )}
      {error && !tooMany && <p className="text-destructive">{error}</p>}
    </div>
  );
}

/** The checked state of "select all" over `animals`. */
const allState = (animals: MedicalBatchAnimal[], selected: Set<string>) => {
  const on = animals.filter((animal) => selected.has(animal.id)).length;
  return on === 0 ? false : on === animals.length ? true : ("indeterminate" as const);
};

function SelectAll({
  animals,
  selected,
  label,
  onToggle,
  className,
}: {
  animals: MedicalBatchAnimal[];
  selected: Set<string>;
  label: string;
  onToggle: (animals: MedicalBatchAnimal[], on: boolean) => void;
  className?: string;
}) {
  const state = allState(animals, selected);
  return (
    <label className={`flex items-center gap-2 text-sm ${className ?? ""}`}>
      <Checkbox
        checked={state}
        aria-label={label}
        onCheckedChange={() => onToggle(animals, state !== true)}
      />
      <span aria-hidden>Select all</span>
    </label>
  );
}

function AnimalGroup({
  group,
  selected,
  shown,
  onToggle,
  labelOf,
}: {
  group: MedicalBatchAnimalGroup;
  selected: Set<string>;
  shown: (animal: MedicalBatchAnimal) => boolean;
  onToggle: (animals: MedicalBatchAnimal[], on: boolean) => void;
  labelOf: (animalId: string) => string;
}) {
  const visible = animalsOfGroup(group).filter(shown);
  if (visible.length === 0) return null;
  const headingId = `batch-group-${group.key}`;
  const label = GROUP_LABELS[group.type];
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          {label && <p className="text-xs text-muted-foreground">{label}</p>}
          <h3 id={headingId} className="font-semibold">
            {group.title}
          </h3>
        </div>
        <SelectAll
          animals={visible}
          selected={selected}
          label={`Select all in ${group.title}`}
          onToggle={onToggle}
        />
      </div>
      {group.type === "LOCATION" ? (
        group.units.map((unit) => (
          <AnimalSet
            key={unit.key}
            set={unit}
            selected={selected}
            shown={shown}
            onToggle={onToggle}
            labelOf={labelOf}
          />
        ))
      ) : (
        <AnimalList
          animals={visible}
          selected={selected}
          onToggle={onToggle}
          labelOf={labelOf}
        />
      )}
    </section>
  );
}

function AnimalSet({
  set,
  selected,
  shown,
  onToggle,
  labelOf,
}: {
  set: MedicalBatchAnimalSet;
  selected: Set<string>;
  shown: (animal: MedicalBatchAnimal) => boolean;
  onToggle: (animals: MedicalBatchAnimal[], on: boolean) => void;
  labelOf: (animalId: string) => string;
}) {
  const visible = set.animals.filter(shown);
  if (visible.length === 0) return null;
  const headingId = `batch-set-${set.key}`;
  return (
    <div role="group" aria-labelledby={headingId} className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={headingId} className="text-sm font-medium">
          {set.title}
        </h4>
        <SelectAll
          animals={visible}
          selected={selected}
          label={`Select all in ${set.title}`}
          onToggle={onToggle}
        />
      </div>
      <AnimalList
          animals={visible}
          selected={selected}
          onToggle={onToggle}
          labelOf={labelOf}
        />
    </div>
  );
}

function AnimalList({
  animals,
  selected,
  onToggle,
  labelOf,
}: {
  animals: MedicalBatchAnimal[];
  selected: Set<string>;
  onToggle: (animals: MedicalBatchAnimal[], on: boolean) => void;
  labelOf: (animalId: string) => string;
}) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {animals.map((animal) => (
        <li key={animal.id}>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.has(animal.id)}
              onCheckedChange={(checked) => onToggle([animal], !!checked)}
            />
            <span>
              {animal.name}{" "}
              {/* The label is the name, then its details in brackets. */}
              <span className="text-muted-foreground">
                {labelOf(animal.id).slice(animal.name.length).trim()}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
