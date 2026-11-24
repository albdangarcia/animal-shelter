import { z } from "zod";
import { PartnerType } from "@/prisma/generated/enums";
import { HOME_COUNTRY, isCountryCode } from "@/app/lib/constants/countries";
import {
  currentPageSchema,
  optionalUsStateSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "./common.schemas";

export const PartnersDirectoryParamsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  pageSize: pageSizeSchema,
  type: z.string().optional(),
  status: z.string().optional(),
});

/** The message for a state on a partner outside the US. */
export const PARTNER_STATE_OUTSIDE_US =
  "Only a partner in the United States has a state.";

/** Whether `country` (a form value: empty, "US" or another code) is the US. */
export const isHomeCountry = (country: string | undefined): boolean =>
  !country || country === HOME_COUNTRY;

// A partner's country is an ISO 3166-1 alpha-2 code; empty or "US" is the
// US, and is saved as no country. Only a US partner has a state: the form
// hides State and clears it when another country is picked, and a state sent
// with another country is refused under State.
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
  country: z
    .string()
    .optional()
    .refine((val) => !val || isCountryCode(val), {
      error: "Please select a valid country.",
    }),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
}).superRefine((values, ctx) => {
  if (values.state && !isHomeCountry(values.country)) {
    ctx.addIssue({ code: "custom", path: ["state"], message: PARTNER_STATE_OUTSIDE_US });
  }
});

export type PartnerFormInput = z.input<typeof PartnerFormSchema>;

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