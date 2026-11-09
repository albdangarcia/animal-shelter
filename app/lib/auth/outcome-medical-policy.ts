import { can } from "./can";
import { AppPermissions } from "./permissions";
import type { OutcomeType } from "@/prisma/generated/enums";

export const isClinicalOutcome = (type: OutcomeType) => type === "EUTHANIZED" || type === "DECEASED";

/** A linked date is a clinical change even when the payload was omitted. */
export function canWriteOutcomeMedical(role: string | null | undefined, operation: {
  type: OutcomeType; creating?: boolean; linked?: boolean; dayChanges?: boolean; medicalSupplied?: boolean;
}) {
  return can(role, AppPermissions.OUTCOMES_MANAGE) &&
    (!(operation.medicalSupplied || (isClinicalOutcome(operation.type) && operation.creating) ||
      (operation.linked && operation.dayChanges)) || can(role, AppPermissions.MEDICAL_MANAGE));
}
