import { z } from "zod";
import { ApplicationStatus } from "@/prisma/generated/enums";
import { cuidSchema } from "./common.schemas";
import { householdSuperRefine } from "./household-profile.schemas";
import { myAdoptionAppFieldsShape } from "./myAdoptionApplication.schema";

// Exclude 'ADOPTED' from this list.
const updatableApplicationStatuses = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
] as const;

export const StaffUpdateAdoptionAppFormSchema = z.object({
  status: z
    .enum(updatableApplicationStatuses, {
      error: "Invalid application status.",
    })
    .optional(),
  internalNotes: z.string().optional(),
  statusChangeReason: z.string().optional(),
});

export type StaffUpdateAdoptionAppFormInput = z.input<
  typeof StaffUpdateAdoptionAppFormSchema
>;

// The public application shape plus the animal selection field. Composed from
// the shared shape (rather than extending MyAdoptionAppFormSchema) so the
// household refinement is applied once, to the finished object.
// Any future changes to myAdoptionAppFieldsShape are inherited automatically.
export const StaffAdoptionApplicationFormSchema = z
  .object({ ...myAdoptionAppFieldsShape, animalId: cuidSchema })
  .superRefine(householdSuperRefine);

export type StaffAdoptionApplicationFormInput = z.input<
  typeof StaffAdoptionApplicationFormSchema
>;
