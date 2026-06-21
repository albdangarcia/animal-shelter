import { z } from "zod";
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
  account: z.string().optional(),
});

const stateCodes = US_STATES.map((state) => state.code) as [
  string,
  ...string[]
];

export const PersonFormSchema = z.object({
  name: z.string().min(1, {
    error: "Name is required.",
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

export const PersonNotesParamsSchema = z.object({
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  status: z.string().optional(),
});

export const PersonNoteFormSchema = z.object({
  content: z.string().min(1, { error: "Content cannot be empty." }),
});