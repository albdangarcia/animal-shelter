import prisma from "@/app/lib/prisma";
import { MEDICAL_ENTRY_DISPLAY_SELECT, type MedicalEntryDisplay } from "./medical-entry";
import type { OutcomeMedicalDetailsInput } from "../../zod-schemas/outcome-medical.schemas";

/** A separate projection: the ordinary outcome read never fetches clinical facts. */
export const findOutcomeMedical = (outcomeId: string) => prisma.medicalEntry.findUnique({
  where: { outcomeId }, select: MEDICAL_ENTRY_DISPLAY_SELECT,
});

export function outcomeMedicalFormValues(entry: MedicalEntryDisplay | null): OutcomeMedicalDetailsInput | undefined {
  if (entry?.euthanasia && entry.source && entry.source !== "BEFORE_INTAKE") {
    const { authorizedBy: _authorizer, performedBy: _performer, ...details } = entry.euthanasia;
    return { kind: "EUTHANASIA", source: entry.source, vetPartnerId: entry.vetPartnerId, vetName: entry.vetName, ...details };
  }
  if (entry?.death) return { kind: "DEATH", ...entry.death, causeKnowledge: entry.death.cause ? "KNOWN" : "UNKNOWN" };
}
