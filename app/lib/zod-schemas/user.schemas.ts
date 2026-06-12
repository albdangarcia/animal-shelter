import { z } from "zod";
import { currentPageSchema, pageSizeSchema, searchQuerySchema } from "./common.schemas";

// Schema for the parameters of fetchFilteredUsers function
export const UsersParamsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  role: z.string().optional(), 
  pageSize: pageSizeSchema
});