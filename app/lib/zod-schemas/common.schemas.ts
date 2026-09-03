import { z } from "zod";
import { US_STATES } from "@/app/lib/constants/us-states";

export const searchQuerySchema = z.string().trim().max(100, {
  error: "Query cannot exceed 100 characters.",
});

const stateCodes = US_STATES.map((s) => s.code) as [string, ...string[]];

// Required: must be one of the 50 valid US state codes.
export const usStateSchema = z.enum(stateCodes, {
  error: "Please select a valid US state.",
});

// Optional: empty/undefined allowed, but if present must be a valid code.
export const optionalUsStateSchema = z
  .string()
  .optional()
  .refine((val) => !val || stateCodes.includes(val), {
    error: "Please select a valid US state.",
  });

// Helper for CUID validation
export const cuidSchema = z.cuid2({
  error: "Invalid ID format. Expected a CUID.",
});

/**
 * Ids owned by Better Auth: User, Session, Account, Verification.
 *
 * Better Auth generates these itself on insert (32-char random base62), so the
 * `@default(cuid())` on those models in schema.prisma never fires and the values
 * are NOT CUIDs. Validating them with `cuidSchema` rejects any id containing an
 * uppercase letter. Use this schema for those ids; use `cuidSchema` for every
 * Prisma-generated id.
 */
export const authIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64, { error: "Invalid ID format." });

// Reusable schema for currentPage
export const currentPageSchema = z.int().positive({
  error: "Page number must be a positive integer.",
});

export const pageSizeSchema = z.coerce
  .number()
  .transform((val) => ([10, 20, 30, 40, 50].includes(val) ? val : 10));

export const SignInFormSchema = z.object({
  email: z.email({ error: "Please enter a valid email address." }),
  password: z
    .string()
    .min(6, { error: "Password must be at least 6 characters." }),
});

export type SignInFormInput = z.input<typeof SignInFormSchema>;

export const requiredNumber = (label: string) =>
  z.number({
    error: (issue) =>
      issue.input === undefined || issue.input === null
        ? `${label} is required.`
        : `${label} must be a number.`,
  });
