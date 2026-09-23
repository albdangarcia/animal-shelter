import { z } from "zod";
import { ApplicationStatus } from "@/prisma/generated/enums";
import { cuidSchema } from "./common.schemas";
import { householdSuperRefine } from "./household-profile.schemas";
import { myAdoptionAppFieldsShape } from "./myAdoptionApplication.schema";

export const StaffUpdateAdoptionAppFormSchema = z.object({
  // A review decision. Staff never choose adopted or closed; an outcome for
  // the animal is what makes an application either.
  status: z
    .enum(ApplicationStatus, {
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
