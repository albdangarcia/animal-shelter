import {
  ExamType,
  MedicalEntryKind,
  SurgeryProcedure,
} from "@/prisma/generated/enums";
import {
  EXAM_TYPE_LABELS,
  SURGERY_PROCEDURE_LABELS,
} from "@/app/lib/constants/medical";

/** What naming an entry reads from it. */
export interface NameableMedicalEntry {
  kind: MedicalEntryKind;
  item: { name: string } | null;
  procedure?: SurgeryProcedure | null;
  examType?: ExamType | null;
}

/**
 * What a page, a button, the due list and the attention queue call an entry:
 * - a vaccine, test or treatment: its catalog item's name ("DHPP")
 * - a surgery, which has no catalog item: its procedure ("Spay", "Mass
 *   removal", "Other surgery")
 * - a microchip, which has no catalog item either: "Microchip"
 * - an exam, by its type: "Intake exam", "Vet exam", "Recheck exam",
 *   "Pre-adoption exam"
 *
 * An entry missing what names it is a bug, and throws rather than showing a
 * blank name.
 */
export const medicalEntryName = (entry: NameableMedicalEntry): string => {
  switch (entry.kind) {
    case MedicalEntryKind.SURGERY:
      if (!entry.procedure) {
        throw new Error("A surgery entry has no procedure to name it by.");
      }
      return entry.procedure === SurgeryProcedure.OTHER
        ? "Other surgery"
        : SURGERY_PROCEDURE_LABELS[entry.procedure];
    case MedicalEntryKind.MICROCHIP:
      return "Microchip";
    case MedicalEntryKind.EXAM:
      if (!entry.examType) {
        throw new Error("An exam entry has no exam type to name it by.");
      }
      return EXAM_TYPE_LABELS[entry.examType];
    default:
      if (!entry.item) {
        throw new Error(
          `A ${entry.kind.toLowerCase()} entry has no catalog item to name it by.`,
        );
      }
      return entry.item.name;
  }
};
