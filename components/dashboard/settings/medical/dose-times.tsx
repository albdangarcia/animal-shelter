"use client";

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpLink } from "@/components/dashboard/help/help-link";
import type { HelpLinkGuide } from "@/app/lib/guides/help-paths";
import { DOSE_SLOT_LABELS, DOSE_SLOT_ORDER } from "@/app/lib/constants/medical";
import type { DoseSlotEnds } from "@/app/lib/utils/medication-slots";
import { formatTimeOfDay } from "@/app/lib/utils/shelter-day";
import { useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";
import { DiscardChangesDialog } from "@/components/dashboard/animals/medical/discard-changes-dialog";
import { DoseTimesForm, type DoseTimesFormHandle } from "./dose-times-form";

interface Props {
  ends: DoseSlotEnds;
  /** The guide the "?" opens, or null for no "?". */
  help: HelpLinkGuide | null;
}

/** The dose slots' end times, and the dialog that changes them. */
export default function DoseTimes({ ends, help }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const formRef = useRef<DoseTimesFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => formRef.current?.isDirty() ?? false, setIsOpen);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Dose Times</CardTitle>
        <CardDescription>
          When each dose slot ends on the shelter&apos;s clock. A slot with no
          dose recorded by then reads as missed. A change applies to every
          slot from then on; doses already recorded keep their slot.
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <HelpLink guide={help} />
          {/* Not closed under a save: its result closes the dialog. */}
          <Dialog
            open={isOpen}
            onOpenChange={(next) => !formRef.current?.isPending() && guardedOnOpenChange(next)}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Pencil className="size-4 mr-2" />
                Edit dose times
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Edit Dose Times</DialogTitle>
                <DialogDescription>
                  Each slot ends at a time of day, AM before Midday before PM. A
                  slot not recorded by its end time reads as missed.
                </DialogDescription>
              </DialogHeader>
              <DoseTimesForm
                ref={formRef}
                ends={ends}
                onFormSubmit={() => setIsOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {DOSE_SLOT_ORDER.map((slot) => (
            <div key={slot} className="rounded-lg border p-4">
              <dt className="text-sm text-muted-foreground">
                {DOSE_SLOT_LABELS[slot]} doses end at
              </dt>
              <dd className="text-lg font-medium">{formatTimeOfDay(ends[slot])}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        subject="dose times"
      />
    </Card>
  );
}
