"use client";

import {
  createContext,
  useContext,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form } from "@/components/ui/form";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MedicalEntryKind } from "@/prisma/generated/enums";
import type { ScheduledBatchFormOptions } from "@/app/lib/data/medical-batch.data";
import type { MedicalBatchAnimalRefusal } from "@/app/lib/services/medical-batch";
import {
  loadScheduledBatchFormOptions,
  recordScheduledMedicalBatch,
} from "@/app/lib/actions/medical-entry.actions";
import {
  RecordScheduledBatchSchema,
  medicalEntryFieldErrors,
  rabiesDurationIssue,
  type RecordScheduledBatchFormInput,
} from "@/app/lib/zod-schemas/medical-entry.schemas";
import { scheduledBatchIssue } from "@/app/lib/utils/medical-batch";
import {
  formatShelterDay,
  type CalendarDay,
} from "@/app/lib/utils/shelter-day";
import {
  DirtyFormHandle,
  haveFormValuesChanged,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { DiscardChangesDialog } from "@/components/dashboard/animals/medical/discard-changes-dialog";
import { DUE_HEADING_ID } from "@/components/dashboard/animals/medical/use-entry-dialog-focus";
import {
  BatchGivenFields,
  applyBatchFieldErrors,
  batchGivenValues,
  batchItemFills,
  blankBatchForm,
  offersNextDose,
  submitBatchForm,
  suggestedNextDay,
  type BatchFormState,
} from "./batch-given-fields";
import { BatchRefusals } from "./batch-refusals";

/** A row of the due list that can be picked to record with others. */
export interface SelectableDue {
  entryId: string;
  animalId: string;
  /** As the list names it: with its details when another animal there has
   * the same name. */
  animalName: string;
  itemId: string;
  itemName: string;
  kind: MedicalEntryKind;
  dueDate: CalendarDay;
}

interface Selection {
  /** The rows picked that are still on the list, in list order. */
  selected: SelectableDue[];
  isSelected: (entryId: string) => boolean;
  toggle: (entryId: string, on: boolean) => void;
  clear: () => void;
}

const SelectionContext = createContext<Selection | null>(null);

const useSelection = () => {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("Due rows are picked inside DueSelection.");
  return selection;
};

/**
 * Holds which rows of the due list are picked, so several due entries for
 * one item can be recorded as given at once. `entries` are the rows that can
 * be picked; a picked row that has since left the list no longer counts.
 */
export function DueSelection({
  entries,
  children,
}: {
  entries: SelectableDue[];
  children: ReactNode;
}) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const selection: Selection = {
    selected: entries.filter((entry) => ids.has(entry.entryId)),
    isSelected: (entryId) => ids.has(entryId),
    toggle: (entryId, on) =>
      setIds((current) => {
        const next = new Set(current);
        if (on) next.add(entryId);
        else next.delete(entryId);
        return next;
      }),
    clear: () => setIds(new Set()),
  };
  return (
    <SelectionContext.Provider value={selection}>{children}</SelectionContext.Provider>
  );
}

/** Picks one row of the due list. */
export function DueRowCheckbox({ entry }: { entry: SelectableDue }) {
  const { isSelected, toggle } = useSelection();
  return (
    <Checkbox
      className="mt-1"
      checked={isSelected(entry.entryId)}
      onCheckedChange={(checked) => toggle(entry.entryId, !!checked)}
      aria-label={`Select ${entry.itemName} (Due ${formatShelterDay(entry.dueDate)}) for ${entry.animalName}`}
    />
  );
}

const HINT_ID = "record-selected-hint";

/**
 * How the dialog names each entry's animal: as the list does (with its
 * details when another animal there has the same name), and with its due
 * day when one animal has two of the entries.
 */
const entryLabels = (entries: SelectableDue[]) => {
  const animal = (entry: SelectableDue) => entry.animalName;
  const twice = (entry: SelectableDue) =>
    entries.filter((row) => row.animalId === entry.animalId).length > 1;
  return {
    animal,
    entry: (entry: SelectableDue) =>
      twice(entry)
        ? `${animal(entry)}, due ${formatShelterDay(entry.dueDate)}`
        : animal(entry),
  };
};

/**
 * "Record selected as given": the picked rows, when they share one item,
 * recorded with the same details. Otherwise disabled, saying why.
 */
export function RecordSelectedButton() {
  const { selected, clear } = useSelection();
  const issue = scheduledBatchIssue(selected);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ScheduledBatchFormOptions>();
  // What the dialog records: the rows picked when it opened.
  const [entries, setEntries] = useState<SelectableDue[]>([]);
  const opening = useRef(0);
  const saved = useRef(false);
  // While a save is under way the dialog stays open, so what it reports
  // can't land on a selection or dialog opened after it.
  const saving = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<DirtyFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      (next: boolean) => {
        if (!next) opening.current++;
        setOpen(next);
      },
    );

  const openDialog = () => {
    if (issue) return;
    saved.current = false;
    setEntries(selected);
    setOptions(undefined);
    setOpen(true);
    const thisOpening = ++opening.current;
    void (async () => {
      let message: string;
      try {
        const result = await loadScheduledBatchFormOptions(selected[0].itemId);
        if (thisOpening !== opening.current) return;
        if (result.ok) {
          setOptions(result.options);
          return;
        }
        message = result.message;
      } catch {
        if (thisOpening !== opening.current) return;
        message = "Could not load the form. Try again.";
      }
      toast.error(message);
      opening.current++;
      setOpen(false);
    })();
  };

  const first = entries[0];
  const labels = entryLabels(entries);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        size="sm"
        disabled={!!issue}
        aria-describedby={issue ? HINT_ID : undefined}
        onClick={openDialog}
      >
        <ListChecks className="mr-2 size-4" />
        Record selected as given
        {selected.length > 0 && ` (${selected.length})`}
      </Button>
      {issue && (
        <p id={HINT_ID} className="text-sm text-muted-foreground">
          {issue}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && saving.current) return;
          guardedOnOpenChange(next);
        }}
      >
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            // The button isn't the dialog's own trigger, so focus is put
            // back by hand. After a save the rows recorded are gone and the
            // button has nothing picked, so focus goes to the heading.
            event.preventDefault();
            if (saved.current) document.getElementById(DUE_HEADING_ID)?.focus();
            else buttonRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {entries.length === 1
                ? `Record ${first?.itemName} as given`
                : `Record ${entries.length} ${first?.itemName} entries as given`}
            </DialogTitle>
            <DialogDescription>
              The same details are recorded for{" "}
              {[...new Set(entries.map((entry) => labels.animal(entry)))].join(", ")}.
              The item&apos;s defaults are filled in.
            </DialogDescription>
          </DialogHeader>
          {options && first ? (
            <RecordSelectedForm
              entries={entries}
              options={options}
              onSavingChange={(value) => (saving.current = value)}
              onSaved={() => {
                saved.current = true;
                clear();
                setOpen(false);
              }}
              ref={formRef}
            />
          ) : (
            <p
              role="status"
              className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Loading the form…
            </p>
          )}
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </div>
  );
}

function RecordSelectedForm({
  entries,
  options,
  onSavingChange,
  onSaved,
  ref,
}: {
  entries: SelectableDue[];
  options: ScheduledBatchFormOptions;
  onSavingChange: (saving: boolean) => void;
  onSaved: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}) {
  const { item, vetClinics, today } = options;
  const kind = entries[0].kind as
    | typeof MedicalEntryKind.VACCINE
    | typeof MedicalEntryKind.TREATMENT;
  const labels = entryLabels(entries);
  const [isPending, startTransition] = useTransition();
  const [refusals, setRefusals] = useState<MedicalBatchAnimalRefusal[]>([]);
  const [entriesError, setEntriesError] = useState<string>();
  const form = useForm<BatchFormState>({
    defaultValues: {
      ...blankBatchForm(today),
      ...batchItemFills(item),
      scheduleNext: { dueDate: suggestedNextDay(item, today, today) },
    },
  });
  const initialValues = useRef(form.getValues());
  useImperativeHandle(ref, () => ({
    isDirty: () => haveFormValuesChanged(form.getValues(), initialValues.current),
  }));
  const nextOffered = offersNextDose(item);

  const onSubmit = (state: BatchFormState) => {
    setRefusals([]);
    setEntriesError(undefined);
    // The schema checks what the flat state holds for the kind.
    const payload = {
      ...batchGivenValues(state, kind, nextOffered),
      entries: entries.map((entry) => ({
        entryId: entry.entryId,
        rabiesTagNumber: item.isRabies ? (state.tags[entry.entryId] ?? "") : null,
      })),
    } as RecordScheduledBatchFormInput;
    const parsed = RecordScheduledBatchSchema.safeParse(payload);
    const durationIssue =
      kind === MedicalEntryKind.VACCINE
        ? rabiesDurationIssue(item.isRabies, state.durationMonths)
        : null;
    if (!parsed.success || durationIssue) {
      if (!parsed.success) {
        setEntriesError(
          applyBatchFieldErrors(form, medicalEntryFieldErrors(parsed.error), "entries"),
        );
      }
      if (durationIssue) {
        form.setError("durationMonths", { type: "manual", message: durationIssue });
      }
      return;
    }

    startTransition(async () => {
      onSavingChange(true);
      let result;
      try {
        result = await recordScheduledMedicalBatch(payload);
      } finally {
        onSavingChange(false);
      }
      if (result.ok) {
        toast.success(result.message);
        onSaved();
        return;
      }
      toast.error(result.message);
      if ("refusals" in result && result.refusals) setRefusals(result.refusals);
      setEntriesError(
        applyBatchFieldErrors(
          form,
          (result.fieldErrors ?? {}) as Record<string, string[]>,
          "entries",
        ),
      );
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={submitBatchForm(form, onSubmit)} className="space-y-6">
        <BatchGivenFields
          form={form}
          kind={kind}
          item={item}
          vetClinics={vetClinics}
          today={today}
          tagged={entries.map((entry) => ({
            key: entry.entryId,
            label: labels.entry(entry),
          }))}
          notesPlaceholder="Left empty, each entry keeps the notes it was scheduled with."
        />
        {entriesError && <p className="text-sm text-destructive">{entriesError}</p>}
        <BatchRefusals
          refusals={refusals}
          labelOf={(refusal) => {
            const entry = entries.find((row) => row.entryId === refusal.entryId);
            return entry ? labels.entry(entry) : refusal.animalName;
          }}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record {entries.length} as given
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
