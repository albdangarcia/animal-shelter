import { z } from "zod";
import { PersonType } from "@prisma/client";
import {
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "./common.schemas";

export const PeopleDirectoryParamsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  pageSize: pageSizeSchema,
  type: z
    .string()
    .optional()
    .transform((val) => val?.split(",").filter(Boolean))
    .pipe(z.array(z.enum(PersonType)).optional()),
});