import { z } from "zod";
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

// Staff-managed person records (walk-in create + staff edit) must carry a way
// to reach the person, or they end up as thin, unidentifiable, duplicate-prone
// rows. This is intentionally NOT used for _updateMyProfile (registered users
// are identified by their User.email; their Person contact fields are
// optional supplementary info) or for the Person created during registration
// (auth.ts's CustomPrismaAdapter.createUser, which never parses this schema).
export const StaffPersonFormSchema = PersonFormSchema.superRefine(
  (data, ctx) => {
    if (!data.email && !data.phone) {
      ctx.addIssue({
        code: "custom",
        message: "Provide an email or phone number so this person can be contacted.",
        path: ["email"],
      });
    }
  },
);

export const PersonNotesParamsSchema = z.object({
  currentPage: currentPageSchema,
  sort: z.string().optional(),
  status: z.string().optional(),
});

export const PersonNoteFormSchema = z.object({
  content: z.string().min(1, { error: "Content cannot be empty." }),
});