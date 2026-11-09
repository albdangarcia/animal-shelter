"use client";

import { useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MedicalConditionStatus } from "@/prisma/generated/enums";
import type {
  ConditionFormChoices,
  MedicalConditionDisplay,
} from "@/app/lib/data/animals/medical-condition.data";
import { voidMedicalCondition } from "@/app/lib/actions/medical-condition.actions";
import { conditionLabel } from "@/app/lib/utils/problem-list";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { ConditionForm } from "./condition-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { VoidReasonDialog } from "./void-reason-dialog";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";

/** What the form opens to: a correction, or a change of status. */
type FormPurpose = "edit" | "resolve" | "reactivate";

const DIALOG_TEXT: Record<
  FormPurpose,
  { title: string; description: string; submit: string }
> = {
  edit: {
    title: "Edit",
    description:
      "Correct what was recorded. Every change is kept in its history, with what it was before.",
    submit: "Save Changes",
  },
  resolve: {
    title: "Resolve",
    description:
      "Say when it resolved. It stays on the problem list as resolved.",
    submit: "Resolve",
  },
  reactivate: {
    title: "Make active again:",
    description: "It came back. Pick Chronic instead if it is lasting.",
    submit: "Save Changes",
  },
};

interface Props {
  animalId: string;
  condition: MedicalConditionDisplay;
  choices: ConditionFormChoices;
  today: CalendarDay;
  /** Where focus goes when the row's menu is gone, after a void. */
  fallbackId?: string;
}

/**
 * The row menu for a problem-list row that isn't voided: Edit, Resolve or
 * Make active (corrections of its status), and Void.
 */
export function ConditionActions({
  animalId,
  condition,
  choices,
  today,
  fallbackId,
}: Props) {
  const [purpose, setPurpose] = useState<FormPurpose>("edit");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const formRef = useRef<DirtyFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      setIsFormOpen,
    );
  const openForm = (next: FormPurpose) => {
    setPurpose(next);
    setIsFormOpen(true);
  };
  // The dialogs open from a menu item that is gone by the time they close.
  const { triggerRef, returnFocus } = useEntryDialogFocus(fallbackId);

  const what = conditionLabel(condition);
  const resolved = condition.status === MedicalConditionStatus.RESOLVED;
  const text = DIALOG_TEXT[purpose];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={`Actions for ${what}`}
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => openForm("edit")}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {resolved ? (
            <DropdownMenuItem onSelect={() => openForm("reactivate")}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Make active
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => openForm("resolve")}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Resolve
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setIsVoidOpen(true)}
          >
            <Ban className="mr-2 h-4 w-4" />
            Void…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isFormOpen} onOpenChange={guardedOnOpenChange}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={returnFocus}
        >
          <DialogHeader>
            <DialogTitle>
              {text.title} {what}
            </DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          <ConditionForm
            key={purpose}
            animalId={animalId}
            mode={{
              edit: condition,
              status:
                purpose === "resolve"
                  ? MedicalConditionStatus.RESOLVED
                  : purpose === "reactivate"
                    ? MedicalConditionStatus.ACTIVE
                    : undefined,
            }}
            choices={choices}
            today={today}
            submitLabel={text.submit}
            onFormSubmit={() => setIsFormOpen(false)}
            ref={formRef}
          />
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />

      <VoidReasonDialog
        open={isVoidOpen}
        onOpenChange={setIsVoidOpen}
        title={`Void ${what}?`}
        description={
          <>
            <p>
              This is for a row that should never have been added, such as one
              added to the wrong animal. To fix a detail, edit it instead; if it
              is over, resolve it.
            </p>
            <p>
              It stays on the problem list, struck through, and stops counting.
              A void can&apos;t be undone: if it was right after all, add it
              again.
            </p>
          </>
        }
        confirmLabel="Void"
        onVoid={(reason) => voidMedicalCondition(condition.id, { reason })}
        onCloseAutoFocus={returnFocus}
      />
    </>
  );
}
