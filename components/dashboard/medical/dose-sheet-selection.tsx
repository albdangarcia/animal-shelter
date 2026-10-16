"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DoseSlot } from "@/prisma/generated/enums";
import { MAX_BATCH_SIZE } from "@/app/lib/constants/medical";
import { recordMedicationDosesGiven } from "@/app/lib/actions/medication.actions";
import type { MedicationBatchSlotRefusal } from "@/app/lib/services/medication-dose";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

/** The page's heading: focus goes there once the doses picked are recorded. */
export const DOSE_SHEET_HEADING_ID = "dose-sheet-heading";

/** A slot of the sheet that can be picked to record with others. */
export interface SelectableDose {
  /** Unique on the sheet: the order, the day and the slot. */
  key: string;
  orderId: string;
  slotDate: CalendarDay;
  slot: DoseSlot;
  /** As the sheet names it: with its details when another animal there has
   * the same name. */
  animalName: string;
  /** "Doxycycline, AM dose on Oct 14, 2026". */
  label: string;
}

interface Selection {
  /** The slots picked that can still take a dose, in sheet order. */
  selected: SelectableDose[];
  isSelected: (key: string) => boolean;
  toggle: (key: string, on: boolean) => void;
  /** Opens the dialog that records the slots picked. */
  openRecordDialog: () => void;
  /** The "Record selected as given" button, where focus goes back when the
   * dialog closes unsaved. */
  buttonRef: RefObject<HTMLButtonElement | null>;
}

const SelectionContext = createContext<Selection | null>(null);

const useSelection = () => {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("Doses are picked inside DoseSelection.");
  return selection;
};

const tooManyText = (count: number) =>
  count > MAX_BATCH_SIZE
    ? `At most ${MAX_BATCH_SIZE} doses can be recorded at once. ${count} are picked.`
    : null;

/**
 * Holds which slots of the sheet are picked, so several can be recorded as
 * given at once, and the dialog that records them. `doses` are the slots
 * that can be picked; a picked slot recorded since (here or elsewhere) is
 * unpicked, so it can't come back picked if its dose is later voided.
 *
 * The dialog lives here rather than beside its button: a refused batch
 * refreshes the sheet, which can take the button away (nothing left to pick,
 * or no row left at all), and the dialog listing why must stay.
 */
export function DoseSelection({
  doses,
  children,
}: {
  doses: SelectableDose[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [keys, setKeys] = useState<Set<string>>(new Set());
  // Drop the picks the sheet no longer offers, each time what it offers
  // changes (adjusting state while rendering, so no render shows them).
  const offered = doses.map((dose) => dose.key).join("|");
  const [lastOffered, setLastOffered] = useState(offered);
  if (offered !== lastOffered) {
    setLastOffered(offered);
    const available = new Set(doses.map((dose) => dose.key));
    if ([...keys].some((key) => !available.has(key))) {
      setKeys(new Set([...keys].filter((key) => available.has(key))));
    }
  }
  const selected = doses.filter((dose) => keys.has(dose.key));

  const [open, setOpen] = useState(false);
  // What the dialog records: the slots picked when it opened.
  const [picked, setPicked] = useState<SelectableDose[]>([]);
  const [refusals, setRefusals] = useState<MedicationBatchSlotRefusal[]>([]);
  const [isPending, startTransition] = useTransition();
  const saved = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selection: Selection = {
    selected,
    isSelected: (key) => keys.has(key),
    toggle: (key, on) =>
      setKeys((current) => {
        const next = new Set(current);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      }),
    openRecordDialog: () => {
      if (selected.length === 0 || tooManyText(selected.length)) return;
      saved.current = false;
      setPicked(selected);
      setRefusals([]);
      setOpen(true);
    },
    buttonRef,
  };

  const onRecord = () => {
    setRefusals([]);
    startTransition(async () => {
      const result = await recordMedicationDosesGiven(
        picked.map(({ orderId, slotDate, slot }) => ({ orderId, slotDate, slot })),
      );
      if (result.ok) {
        toast.success(result.message);
        saved.current = true;
        setKeys(new Set());
        setOpen(false);
        return;
      }
      toast.error(result.message);
      if ("refusals" in result && result.refusals) setRefusals(result.refusals);
      // A slot may have been recorded, or its order changed, since the sheet
      // was read: show the sheet as it is now.
      router.refresh();
    });
  };

  const labelOf = (refusal: MedicationBatchSlotRefusal) =>
    picked.find(
      (dose) =>
        dose.orderId === refusal.orderId &&
        dose.slotDate === refusal.slotDate &&
        dose.slot === refusal.slot,
    )?.animalName ?? refusal.animalName;

  return (
    <SelectionContext.Provider value={selection}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // While the save is out the dialog stays, so what it reports can't
          // land on a selection made after it.
          if (!next && isPending) return;
          setOpen(next);
        }}
      >
        <DialogContent
          className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            // The button isn't the dialog's own trigger, so focus is put
            // back by hand. After a save several rows changed, and after a
            // refusal the slots picked may be gone, with the button disabled
            // or gone too, so focus goes to the heading then.
            event.preventDefault();
            const button = buttonRef.current;
            if (saved.current || !button?.isConnected || button.disabled) {
              document.getElementById(DOSE_SHEET_HEADING_ID)?.focus();
            } else button.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Record {countText(picked.length)} as given</DialogTitle>
            <DialogDescription>
              Each is recorded as given now, by you. If any can&apos;t be,
              none is.
            </DialogDescription>
          </DialogHeader>
          <ul className="ml-4 list-disc space-y-1 text-sm">
            {picked.map((dose) => (
              <li key={dose.key}>
                <span className="font-medium">{dose.animalName}</span>: {dose.label}
              </li>
            ))}
          </ul>
          {refusals.length > 0 && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive/50 p-3 text-sm"
            >
              <p className="font-medium text-destructive">
                Nothing was saved. Unpick{" "}
                {refusals.length === 1 ? "this dose" : "these doses"}, then try
                again:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                {refusals.map((refusal) => (
                  <li key={`${refusal.orderId}:${refusal.slotDate}:${refusal.slot}`}>
                    <span className="font-medium">{labelOf(refusal)}</span>:{" "}
                    {refusal.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" disabled={isPending} onClick={onRecord}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record {picked.length} as given
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SelectionContext.Provider>
  );
}

/** Picks one slot of the sheet. */
export function DoseRowCheckbox({ dose }: { dose: SelectableDose }) {
  const { isSelected, toggle } = useSelection();
  return (
    <Checkbox
      className="mt-1"
      checked={isSelected(dose.key)}
      onCheckedChange={(checked) => toggle(dose.key, !!checked)}
      aria-label={`Select ${dose.label} for ${dose.animalName}`}
    />
  );
}

const HINT_ID = "record-selected-doses-hint";

const countText = (count: number) => (count === 1 ? "1 dose" : `${count} doses`);

/**
 * "Record selected as given": the slots picked, each recorded as given now,
 * all or nothing, after a dialog that lists them. A refusal lists each
 * refused slot there, and nothing is saved.
 */
export function RecordSelectedDosesButton() {
  const { selected, openRecordDialog, buttonRef } = useSelection();
  const issue = tooManyText(selected.length);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        size="sm"
        disabled={selected.length === 0 || !!issue}
        aria-describedby={issue ? HINT_ID : undefined}
        onClick={openRecordDialog}
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
    </div>
  );
}
