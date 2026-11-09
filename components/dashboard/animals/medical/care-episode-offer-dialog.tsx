"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CareEpisodeType } from "@/prisma/generated/enums";
import type { CareEpisodeOfferPrompt } from "@/app/lib/data/care-episode-offer.data";
import { openEpisodeText } from "@/app/lib/utils/care-status";
import { useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";
import { CareEpisodeForm } from "./care-episode-form";
import {
  CloseCareEpisodeForm,
  type CloseCareEpisodeFormHandle,
} from "./care-episode-actions";
import { DiscardChangesDialog } from "./discard-changes-dialog";

/**
 * Asked after an animal moves into or out of a medical unit: open a stay in
 * house, or close the one it was under. The move is already saved and stands
 * either way; "Not now" closes this with nothing written. A form changed and
 * not saved is asked about before it goes, as the other medical forms are.
 */
export function CareEpisodeOfferDialog({
  offer,
  onDone,
  returnFocusTo,
}: {
  /** Null while there's nothing to ask. A caller with several to ask passes
   * the next once this one is done; each gets a fresh form. */
  offer: CareEpisodeOfferPrompt | null;
  /** Called once the offer is answered or put off. */
  onDone: () => void;
  /** Where focus goes once the dialog has closed, given the last offer
   * shown. Nothing opened this dialog, so there is no trigger to go back to;
   * without an element, focus is left where the browser puts it. */
  returnFocusTo?: (offer: CareEpisodeOfferPrompt) => HTMLElement | null;
}) {
  // The offer last asked, still shown while the dialog closes, and a count of
  // offers shown, which keys the form: the next offer, for this animal or
  // another, never inherits what was typed into the last one.
  const [shown, setShown] = useState(offer);
  const [shownCount, setShownCount] = useState(0);
  if (offer && offer !== shown) {
    setShown(offer);
    setShownCount((count) => count + 1);
  }
  // Either form: each says whether it was changed and whether it is saving.
  const formRef = useRef<CloseCareEpisodeFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(
      () => formRef.current?.isDirty() ?? false,
      (open) => {
        if (!open) onDone();
      },
    );

  return (
    <>
      <Dialog
        open={offer !== null}
        onOpenChange={(open) =>
          !formRef.current?.isPending() && guardedOnOpenChange(open)
        }
      >
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            const target = shown && returnFocusTo?.(shown);
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          {shown?.kind === "OPEN" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {shown.animalName} is now in {shown.placeName}. Open a care
                  episode?
                </DialogTitle>
                <DialogDescription>
                  Moving an animal doesn&apos;t open one by itself. It&apos;s
                  a stay in house from today unless you pick otherwise.
                </DialogDescription>
              </DialogHeader>
              <CareEpisodeForm
                key={shownCount}
                animalId={shown.animalId}
                mode={{ open: { type: CareEpisodeType.HOSPITALISED_IN_HOUSE } }}
                vetClinics={shown.vetClinics}
                today={shown.today}
                submitLabel="Open Episode"
                cancelLabel="Not now"
                onFormSubmit={onDone}
                ref={formRef}
              />
            </>
          )}
          {shown?.kind === "CLOSE" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Close {shown.animalName}&apos;s care episode (
                  {openEpisodeText(shown.episode).replace(/^./, (c) =>
                    c.toLowerCase(),
                  )}
                  )?
                </DialogTitle>
                <DialogDescription>
                  Moving an animal doesn&apos;t close one by itself. Pick the
                  day the care ended; the episode stays on the record, closed.
                </DialogDescription>
              </DialogHeader>
              <CloseCareEpisodeForm
                key={shownCount}
                episodeId={shown.episode.id}
                startDate={shown.episode.startDate}
                today={shown.today}
                cancelLabel="Not now"
                onClosed={onDone}
                ref={formRef}
              />
            </>
          )}
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
