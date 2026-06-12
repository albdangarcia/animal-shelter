import { z } from "zod";
import {
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "./common.schemas";
import { Role } from "@prisma/client";

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
