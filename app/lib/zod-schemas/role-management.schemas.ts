import { z } from "zod";
import {
  authIdSchema,
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "./common.schemas";
import { Role } from "@/prisma/generated/enums";

// Schema for the parameters of _fetchUserRoles function
export const UsersRoleParamsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  role: z
    .string()
    .optional()
    .transform((val) => val?.split(",").filter(Boolean))
    .pipe(
      z.array(z.enum(Object.values(Role) as [string, ...string[]])).optional(),
    ),
  pageSize: pageSizeSchema,
  status: z
    .string()
    .optional()
    .transform((val) => val?.split(",").filter(Boolean))
    .pipe(z.array(z.enum(["active", "deactivated"])).optional()),
});

// Why an account is being deactivated or reactivated, written onto the
// person's record as a note. Bounded because it is stored verbatim in a note
// that other admins read.
const reasonSchema = z
  .string()
  .trim()
  .max(500, { error: "Keep the reason under 500 characters." });

export const DeactivateUserSchema = z.object({
  userId: authIdSchema,
  // A deactivation without a reason leaves the next admin with a red badge and
  // nothing to say why, which is the case this note exists for.
  reason: reasonSchema.min(1, { error: "Say why this account is being deactivated." }),
});

export const ReactivateUserSchema = z.object({
  userId: authIdSchema,
  // Optional: undoing a mistaken deactivation should not take a form.
  reason: reasonSchema,
});
