import { z } from "zod";
import { PartnerType } from "@prisma/client";
import {
  currentPageSchema,
  optionalUsStateSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "./common.schemas";

export const PeopleDirectoryParamsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  pageSize: pageSizeSchema,
  account: z.string().optional(),
});

export const PartnersDirectoryParamsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  pageSize: pageSizeSchema,
  type: z.string().optional(),
  status: z.string().optional(),
});

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
  state: optionalUsStateSchema,
  zipCode: z.string().optional(),
});

export const PartnerFormSchema = z.object({
  name: z.string().min(1, { error: "Name is required." }),
  type: z.enum(PartnerType, {
    error: (issue) =>
      issue.input === undefined ? "Please select a partner type." : undefined,
  }),
  email: z
    .email({ error: "Please enter a valid email address." })
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
  website: z
    .url({ error: "Please enter a valid URL (including https://)." })
    .optional()
    .or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
  state: optionalUsStateSchema,
  zipCode: z.string().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
});

export const PartnerContactFormSchema = z.object({
  personId: z.cuid2({ error: "Please select a person." }),
  role: z.string().optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const PartnerNotesParamsSchema = z.object({
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  status: z.string().optional(),
});

export const PartnerNoteFormSchema = z.object({
  content: z.string().min(1, { error: "Content cannot be empty." }),
});