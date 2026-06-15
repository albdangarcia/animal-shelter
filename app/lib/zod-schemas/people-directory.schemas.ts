import { z } from "zod";
import { PersonType } from "@prisma/client";
import {
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "./common.schemas";
import { US_STATES } from "@/app/lib/constants/us-states";

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

const stateCodes = US_STATES.map((state) => state.code) as [
  string,
  ...string[]
];

export const PersonFormSchema = z.object({
  name: z.string().min(1, {
    error: "Name is required.",
  }),
  type: z.enum(PersonType, {
    error: (issue) =>
      issue.input === undefined ? "Type is required." : undefined,
  }),
  email: z
    .email({ error: "Please enter a valid email address." })
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z
    .string()
    .optional()
    .refine((val) => !val || stateCodes.includes(val), {
      error: "Please select a valid US state.",
    }),
  zipCode: z.string().optional(),
});