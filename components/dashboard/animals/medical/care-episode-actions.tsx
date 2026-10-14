"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { format } from "date-fns";
import { Ban, Loader2, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import { DayField } from "@/components/forms/day-field";
import type { CareEpisodeDisplay } from "@/app/lib/data/animals/medical-condition.data";
import {
  closeCareEpisode,
  voidCareEpisode,
} from "@/app/lib/actions/care-episode.actions";
import {
  CloseCareEpisodeSchema,
  type CloseCareEpisodeInput,
} from "@/app/lib/zod-schemas/care-episode.schemas";
import { careEpisodeLabel } from "@/app/lib/utils/problem-list";
import { applyFieldErrors } from "@/app/lib/utils/form-result-utils";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import {
  DirtyFormHandle,
  useConfirmedOpenChange,
} from "@/hooks/use-confirmed-open-change";
import { CareEpisodeForm } from "./care-episode-form";
import { DiscardChangesDialog } from "./discard-changes-dialog";
import { VoidReasonDialog } from "./void-reason-dialog";
import { useEntryDialogFocus } from "./use-entry-dialog-focus";

interface Props {
  animalId: string;
  episode: CareEpisodeDisplay;
  vetClinics: { id: string; name: string }[];
  today: CalendarDay;
  /** Where focus goes when the row's control is gone, after a close or a
   * void. */
  fallbackId?: string;
}

/**
 * The row menu for a care episode that isn't voided: Edit and Void.
 */
export function CareEpisodeActions({
  animalId,
  episode,
  vetClinics,
  today,
  fallbackId,
}: Props) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const formRef = useRef<DirtyFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      setIsEditOpen,
    );
  // The dialogs open from a menu item that is gone by the time they close.
  const { triggerRef, returnFocus } = useEntryDialogFocus(fallbackId);
  const what = careEpisodeLabel(episode);

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
          <DropdownMenuItem onSelect={() => setIsEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setIsVoidOpen(true)}
          >
            <Ban className="mr-2 h-4 w-4" />
            Void…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isEditOpen} onOpenChange={guardedOnOpenChange}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={returnFocus}
        >
          <DialogHeader>
            <DialogTitle>Edit care episode</DialogTitle>
            <DialogDescription>
              Correct what was recorded. Every change is kept in its history,
              with what it was before. Clearing the end date opens the episode
              again.
            </DialogDescription>
          </DialogHeader>
          <CareEpisodeForm
            animalId={animalId}
            mode={{ edit: episode }}
            vetClinics={vetClinics}
            today={today}
            submitLabel="Save Changes"
            onFormSubmit={() => setIsEditOpen(false)}
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
        title={`Void the care episode (${what})?`}
        description={
          <>
            <p>
              This is for an episode that should never have been recorded,
              such as one recorded for the wrong animal. To fix a detail, edit
              it instead; if the care is over, close it.
            </p>
            <p>
              It stays in the list, struck through, and stops counting. A void
              can&apos;t be undone: if it was right after all, open it again.
            </p>
          </>
        }
        confirmLabel="Void"
        onVoid={(reason) => voidCareEpisode(episode.id, { reason })}
        onCloseAutoFocus={returnFocus}
      />
    </>
  );
}

type CloseFormState = { endDate: string | null };

/**
 * Closes an open care episode on the day it ended, today unless another is
 * picked. Shown on the open episode only. A day picked and not saved is
 * asked about before the dialog closes, as the other forms' changes are.
 */
export function CloseCareEpisodeButton({
  episode,
  animalName,
  today,
  fallbackId,
}: {
  episode: CareEpisodeDisplay;
  animalName: string;
  today: CalendarDay;
  fallbackId?: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { triggerRef, returnFocus } = useEntryDialogFocus(fallbackId);
  const form = useForm<CloseFormState>({
    resolver: standardSchemaResolver(CloseCareEpisodeSchema) as never,
    defaultValues: { endDate: today },
  });
  // The day the form opened on: `today` can move on under an open dialog
  // (a refresh after midnight), and the form still holds the day it began
  // with, which is no change.
  const openedOn = useRef<string>(today);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => form.getValues().endDate !== openedOn.current,
      setIsOpen,
    );
  const what = careEpisodeLabel(episode).replace(/^./, (c) => c.toLowerCase());

  const onSubmit = (state: CloseFormState) => {
    startTransition(async () => {
      const result = await closeCareEpisode(
        episode.id,
        state as CloseCareEpisodeInput,
      );
      if (result.ok) {
        toast.success(result.message);
        setIsOpen(false);
        return;
      }
      applyFieldErrors(form, result.fieldErrors);
      toast.error(result.message);
      // Someone closed or voided it first: show it as it now is.
      if (!result.fieldErrors) router.refresh();
    });
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          openedOn.current = today;
          form.reset({ endDate: today });
          setIsOpen(true);
        }}
      >
        Close episode
      </Button>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => !isPending && guardedOnOpenChange(open)}
      >
        <DialogContent onCloseAutoFocus={returnFocus}>
          <DialogHeader>
            <DialogTitle>
              Close {animalName}&apos;s care episode ({what})?
            </DialogTitle>
            <DialogDescription>
              Pick the day the care ended. The episode stays on the record,
              closed.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <DayField
                control={form.control}
                name="endDate"
                label="End date"
                required
                triggerClassName="w-full sm:w-64"
                disabledDates={(date) => {
                  const day = format(date, "yyyy-MM-dd");
                  return day > today || day < episode.startDate;
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
                  Close Episode
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </>
  );
}
