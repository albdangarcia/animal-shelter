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
import { US_STATES } from "@/app/lib/constants/us-states";
import { useConfirmedOpenChange } from "@/hooks/use-confirmed-open-change";
import { DiscardChangesDialog } from "@/components/dashboard/animals/medical/discard-changes-dialog";
import { SHELTER_DETAILS_DESCRIPTION } from "./shelter-details-copy";
import {
  ShelterDetailsForm,
  type ShelterDetailsFormHandle,
} from "./shelter-details-form";

interface Props {
  /** The shelter's US state code, or null when none is set. */
  state: string | null;
  /** The guide the "?" opens, or null for no "?". */
  help: HelpLinkGuide | null;
}

/** The shelter's details, and the dialog that changes them. */
export default function ShelterDetails({ state, help }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const formRef = useRef<ShelterDetailsFormHandle>(null);
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } =
    useConfirmedOpenChange(() => formRef.current?.isDirty() ?? false, setIsOpen);
  const stateName = US_STATES.find((s) => s.code === state)?.name ?? null;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Shelter Details</CardTitle>
        <CardDescription>{SHELTER_DETAILS_DESCRIPTION}</CardDescription>
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
                Edit shelter details
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[440px]">
              <DialogHeader>
                <DialogTitle>Edit Shelter Details</DialogTitle>
                <DialogDescription>
                  Pick the US state the shelter is in.
                </DialogDescription>
              </DialogHeader>
              <ShelterDetailsForm
                ref={formRef}
                state={state}
                onFormSubmit={() => setIsOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="max-w-xs rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">State</dt>
          <dd className="text-lg font-medium">
            {stateName ?? (
              <span className="text-muted-foreground italic">Not set</span>
            )}
          </dd>
        </dl>
      </CardContent>
      <DiscardChangesDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        subject="shelter details"
      />
    </Card>
  );
}
