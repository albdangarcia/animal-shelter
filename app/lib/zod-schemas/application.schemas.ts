import { z } from "zod";
import { ApplicationStatus } from "@prisma/client";
import { cuidSchema } from "./common.schemas";
import { MyAdoptionAppFormSchema } from "./myApplication.schema";

// Exclude 'ADOPTED' from this list.
const updatableApplicationStatuses = [
  ApplicationStatus.PENDING,
  ApplicationStatus.REVIEWING,
  ApplicationStatus.WAITLISTED,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
] as const;

export const StaffUpdateAdoptionAppFormSchema = z
  .object({
    status: z
      .enum(updatableApplicationStatuses, {
        error: "Invalid application status.",
      })
      .optional(),
    internalNotes: z.string().optional(),
    statusChangeReason: z.string().optional(),
  });

// Extends the public schema with the animal selection field.
// Any future changes to MyAdoptionAppFormSchema are inherited automatically.
export const StaffAdoptionApplicationFormSchema =
  MyAdoptionAppFormSchema.extend({ animalId: cuidSchema });