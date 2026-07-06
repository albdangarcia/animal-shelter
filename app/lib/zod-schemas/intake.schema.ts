import { AnimalHealthStatus, IntakeType } from "@prisma/client";
import { z } from "zod";

export const ReIntakeFormSchema = z
  .object({
    intakeDate: z.date(),
    intakeType: z.enum(IntakeType),
    healthStatus: z.enum(AnimalHealthStatus),
    notes: z.string().optional(),

    // Transfer-specific fields
    sourcePartnerId: z.string().optional(),

    // Stray-specific fields
    foundAddress: z.string().optional(),
    foundCity: z.string().optional(),
    foundState: z.string().optional(),

    // Owner surrender-specific fields
    surrenderingPersonId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Validate Transfer In
    if (data.intakeType === IntakeType.TRANSFER_IN && !data.sourcePartnerId) {
      ctx.addIssue({
        code: "custom",
        message: "Source partner is required for transfer intake",
        path: ["sourcePartnerId"],
      });
    }

    // Validate Stray
    if (data.intakeType === IntakeType.STRAY) {
      if (!data.foundCity) {
        ctx.addIssue({
          code: "custom",
          message: "City is required for stray intake",
          path: ["foundCity"],
        });
      }
      if (!data.foundState) {
        ctx.addIssue({
          code: "custom",
          message: "State is required for stray intake",
          path: ["foundState"],
        });
      }
    }

    // Validate Owner Surrender
    if (
      data.intakeType === IntakeType.OWNER_SURRENDER &&
      !data.surrenderingPersonId
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A surrendering person is required.",
        path: ["surrenderingPersonId"],
      });
    }
  });

export const IntakeFieldsSchema = z.object({
  intakeType: z.enum(IntakeType).optional(),
  intakeDate: z.date().optional(),
  notes: z.string().optional(),
  sourcePartnerId: z.string().optional(),
  foundAddress: z.string().optional(),
  foundCity: z.string().optional(),
  foundState: z.string().optional(),
  surrenderingPersonId: z.string().optional(),
});

export type IntakeFieldsValues = z.infer<typeof IntakeFieldsSchema>;