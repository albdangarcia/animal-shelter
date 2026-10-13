"use client";

import { MedicalEntryKind } from "@/prisma/generated/enums";
import type { MedicalEntryFormOptions } from "@/app/lib/data/medical-catalog.data";
import type { MedicalEntryDisplay } from "@/app/lib/data/animals/medical-entry";
import type { DirtyFormHandle } from "@/hooks/use-confirmed-open-change";
import { MedicalEntryForm, type ScheduledCare } from "./medical-entry-form";
import { SurgeryEntryForm } from "./surgery-entry-form";
import { MicrochipEntryForm } from "./microchip-entry-form";

interface Props {
  animalId: string;
  kind: MedicalEntryKind;
  options: MedicalEntryFormOptions;
  /** Present when editing. */
  entry?: MedicalEntryDisplay;
  /** Present when recording scheduled care as given. */
  scheduled?: ScheduledCare;
  onFormSubmit: () => void;
  ref?: React.Ref<DirtyFormHandle>;
}

/**
 * The form for care of this kind: a surgery and a microchip have their own,
 * and care given from the catalog shares one.
 */
export function CareEntryForm({ kind, ...props }: Props) {
  switch (kind) {
    case MedicalEntryKind.SURGERY:
      return <SurgeryEntryForm {...props} />;
    case MedicalEntryKind.MICROCHIP:
      return <MicrochipEntryForm {...props} />;
    case MedicalEntryKind.EXAM:
      throw new Error("Exams can't be recorded or edited here yet.");
    default:
      return <MedicalEntryForm kind={kind} {...props} />;
  }
}

/** What the dialog recording care of this kind says it is for. */
export const recordDialogDescription = (kind: MedicalEntryKind) => {
  switch (kind) {
    case MedicalEntryKind.SURGERY:
      return "Record a surgery already done: what it was, who did it and how it went.";
    case MedicalEntryKind.MICROCHIP:
      return "Record a chip implanted, or found on a scan before intake.";
    default:
      return "Record care already given. Pick the item first: its defaults fill in the rest.";
  }
};
