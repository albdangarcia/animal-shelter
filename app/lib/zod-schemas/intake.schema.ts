import { AnimalHealthStatus, IntakeType } from "@/prisma/generated/enums";
import { z } from "zod";
import { optionalUsStateSchema } from "./common.schemas";

// The eight fields shared by every intake surface, exported as a raw shape
// plus a standalone refinement — the same shape-composition treatment batch
// 5 applied to householdFieldsShape / householdSuperRefine. Consumers spread
// this shape into a fresh z.object() and re-apply intakeSuperRefine rather
// than calling .extend() on an already-refined schema.
export const intakeFieldsShape = {
  intakeType: z.enum(IntakeType),
  intakeDate: z.date(),
  notes: z.string().optional(),
  sourcePartnerId: z.cuid2().optional().or(z.literal("")),
  // Required when intakeType === STRAY — AnimalFormSchema's rule, which wins
  // over re-intake's looser (optional) one. Do not silently loosen this in a
  // later refactor; it was a deliberate settled decision.
  foundAddress: z.string().optional(),
  foundCity: z.string().optional(),
  foundState: optionalUsStateSchema,
  surrenderingPersonId: z.cuid2().optional().or(z.literal("")),
};

// Typed against only the fields it reads, so it accepts any superset object
// — matching householdSuperRefine.
type IntakeRefineInput = {
  intakeType?: IntakeType;
  sourcePartnerId?: string;
  foundAddress?: string;
  foundCity?: string;
  foundState?: string;
  surrenderingPersonId?: string;
};

export const intakeSuperRefine = (
  data: IntakeRefineInput,
  ctx: z.RefinementCtx,
) => {
  if (data.intakeType === IntakeType.TRANSFER_IN && !data.sourcePartnerId) {
    ctx.addIssue({
      code: "custom",
      message: "Source partner is required for transfers.",
      path: ["sourcePartnerId"],
    });
  }

  if (data.intakeType === IntakeType.OWNER_SURRENDER && !data.surrenderingPersonId) {
    ctx.addIssue({
      code: "custom",
      message: "A surrendering person is required.",
      path: ["surrenderingPersonId"],
    });
  }

  if (data.intakeType === IntakeType.STRAY) {
    if (!data.foundAddress) {
      ctx.addIssue({
        code: "custom",
        message: "Address is required for strays.",
        path: ["foundAddress"],
      });
    }
    if (!data.foundCity) {
      ctx.addIssue({
        code: "custom",
        message: "City is required for strays.",
        path: ["foundCity"],
      });
    }
    if (!data.foundState) {
      ctx.addIssue({
        code: "custom",
        message: "State is required for strays.",
        path: ["foundState"],
      });
    }
  }
};

// All-optional version of the shape above — exists only as the generic
// constraint on IntakeFormFields, which needs every field optional since it
// is shared by both a create form (fields required) and an edit-adjacent
// form (fields absent).
export const IntakeFieldsSchema = z.object(intakeFieldsShape).partial();

export type IntakeFieldsValues = z.infer<typeof IntakeFieldsSchema>;

// Composed from the shared shape, following batch 5's household/applicant
// treatment — a fresh z.object() spreading intakeFieldsShape plus the one
// field (healthStatus) that isn't a transport-shared intake fact, with
// intakeSuperRefine re-applied rather than .extend()'d onto a refined schema.
// This adopts AnimalFormSchema's stricter rules (foundAddress required for
// strays, foundState validated against the US state list, cuid2-typed
// partner/person ids) in place of the looser ones this schema used to define
// on its own — see the migration doc's handoff notes for why.
export const ReIntakeFormSchema = z
  .object({
    ...intakeFieldsShape,
    healthStatus: z.enum(AnimalHealthStatus),
    // An animal fact, not a transport-shared intake fact — so a sibling of the
    // spread, like healthStatus, rather than part of intakeFieldsShape. Plain
    // z.boolean() (the form supplies the default), matching animalFieldsShape.
    isSpayedNeutered: z.boolean(),
  })
  .superRefine(intakeSuperRefine);

export type ReIntakeFormInput = z.input<typeof ReIntakeFormSchema>;
