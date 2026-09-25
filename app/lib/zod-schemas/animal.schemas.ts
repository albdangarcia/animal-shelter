import { z } from "zod";
import { calendarDaySchema } from "./common.schemas";
import type { CalendarDay } from "../utils/shelter-day";
import {
  Sex,
  AnimalSize,
  AnimalHealthStatus,
  TaskStatus,
  TaskCategory,
  TaskPriority,
  NoteCategory,
  AnimalListingStatus,
} from "@/prisma/generated/enums";
import {
  cuidSchema,
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "./common.schemas";
import { intakeFieldsShape, intakeSuperRefine } from "./intake.schema";

const speciesNameSchema = z
  .string()
  .max(50, {
    error: "Species name must be at most 50 characters long.",
  })
  .optional();

// Raw comma-joined color names from the URL (e.g. "Black,Brown").
// Split into an array in the fetcher, mirroring the faceted filter's param handling.
const colorParamSchema = z
  .string()
  .max(200, {
    error: "Color filter is too long.",
  })
  .optional();

// Generic comma-joined facet param (e.g. "MALE,FEMALE" or "SMALL,MEDIUM").
// Values are validated against the real enum in the fetcher before use.
const facetParamSchema = z
  .string()
  .max(100, {
    error: "Filter value is too long.",
  })
  .optional();

export const sortSchema = z
  .string()
  .regex(/^\w+\.(asc|desc)$/, {
    error: "Sort must be in 'field.direction' format",
  })
  .optional();

export const PublishedPetsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  speciesName: speciesNameSchema,
  color: colorParamSchema,
  sex: facetParamSchema,
  size: facetParamSchema,
  sort: sortSchema,
});

export const MyAdoptionApplicationsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  sort: sortSchema,
  status: z.string().optional(),
  pageSize: pageSizeSchema,
});

export const DashboardAnimalsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  listingStatus: z.string().optional(),
  sex: z.string().optional(),
  pageSize: pageSizeSchema,
  sort: z.string().optional(),
});

export const AnimalTasksSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  category: z.string().optional(),
  status: z.string().optional(),
  pageSize: pageSizeSchema,
  sort: z.string().optional(),
  animalId: cuidSchema,
});

// The animal record's own fields — the intake block (eight fields shared with
// re-intake) lives in intakeFieldsShape and is spread in separately below, so
// this shape can be reused by both the create schema (intake required) and
// the edit schema (intake omitted entirely).
const animalFieldsShape = {
  animalName: z.string().min(1, {
    error: "Animal name is required.",
  }),
  species: z.cuid2({
    error: "A valid species ID is required.",
  }),
  breed: z.cuid2({
    error: "A valid primary breed ID is required.",
  }),
  primaryColor: z.cuid2({
    error: "A valid primary color ID is required.",
  }),
  additionalColors: z
    .array(z.cuid2({ error: "A valid color ID is required." }))
    .optional()
    .default([]),
  sex: z.enum(Sex, {
    error: (issue) =>
      issue.input === undefined ? "Sex is required." : undefined,
  }),
  // Expected adult size, staff-selected. Empty string = not specified (stored
  // as null). A Radix Select cannot hold null cleanly, so "" is kept at the
  // schema boundary and mapped to null in toAnimalData().
  size: z.enum(AnimalSize).optional().or(z.literal("")),
  estimatedBirthDate: calendarDaySchema("Estimated birth date"),
  healthStatus: z.enum(AnimalHealthStatus, {
    error: (issue) =>
      issue.input === undefined ? "Health status is required." : undefined,
  }),
  listingStatus: z.enum(AnimalListingStatus, {
    error: (issue) =>
      issue.input === undefined ? "Listing status is required." : undefined,
  }),
  heightCm: z
    .number()
    .positive({ error: "Height must be a positive number." })
    .nullable(),
  microchipNumber: z.string().optional(),
  // Plain z.boolean() (no .default(false)): a default would make the input
  // optional and break the z.input / z.output symmetry this file preserves so
  // the input type stays usable as react-hook-form's values type. The form
  // supplies the default in both the create and edit branches instead.
  isSpayedNeutered: z.boolean(),
  description: z.string().optional(),
  // Optional kennel placement. Empty = Unplaced (null). Location is only a UI
  // cascade helper and is NOT persisted — the unit implies its location.
  currentUnitId: z.cuid2().optional().or(z.literal("")),
};

// Typed against only the fields it reads, so it accepts either derived
// schema's output — matching intakeSuperRefine / householdSuperRefine.
const animalColorSuperRefine = (
  data: { primaryColor: string; additionalColors: string[] },
  ctx: z.RefinementCtx,
) => {
  if (data.additionalColors.includes(data.primaryColor)) {
    ctx.addIssue({
      code: "custom",
      message:
        "The primary color shouldn't be repeated in additional colors.",
      path: ["additionalColors"],
    });
  }
};

// weightGrams is intake-only: edit mode shows a read-only, dated weight
// observation instead of a field (see animal-intake-form.tsx), and never
// renders or populates a defaultValue for it. Kept out of animalFieldsShape
// (rather than nullable-and-required there) so AnimalEditFormSchema doesn't
// require a key its form can never supply — that gap silently blocked every
// edit save with no visible error, since no field exists to show one on.
const weightGramsShape = {
  // Weight at intake, in grams (canonical unit — see app/lib/utils/weight-format.ts).
  weightGrams: z
    .number()
    .int({ error: "Weight must be a whole number of grams." })
    .positive({ error: "Weight must be a positive number." })
    .nullable(),
};

// Spread into a fresh z.object() rather than built via AnimalEditFormSchema
// .extend(), per the migration's rule against extending an already-refined
// schema.
//
// A new animal is listed as a draft or published, nothing else. The form only
// offers those two, but the action takes whatever the schema lets through, and
// an animal created `ARCHIVED` has an intake and no outcome, so its timeline
// says it is here and its listing says it has left. `PENDING_ADOPTION` needs
// an application the animal cannot have yet. This is not in `animalFieldsShape`
// because the edit form resubmits a locked `ARCHIVED` or `PENDING_ADOPTION`.
export const CreateAnimalFormSchema = z
  .object({
    ...animalFieldsShape,
    // Refined rather than re-declared as a two-value enum: the form is one
    // component over both schemas, so the field's type has to stay the same.
    listingStatus: animalFieldsShape.listingStatus.refine(
      (status) =>
        status === AnimalListingStatus.DRAFT ||
        status === AnimalListingStatus.PUBLISHED,
      { error: "A new animal can only be a draft or published." },
    ),
    ...weightGramsShape,
    ...intakeFieldsShape,
  })
  .superRefine((data, ctx) => {
    animalColorSuperRefine(data, ctx);
    intakeSuperRefine(data, ctx);
  });

export const AnimalEditFormSchema = z
  .object({ ...animalFieldsShape })
  .superRefine(animalColorSuperRefine);

export type CreateAnimalFormInput = z.input<typeof CreateAnimalFormSchema>;
export type AnimalEditFormInput = z.input<typeof AnimalEditFormSchema>;

export const TaskFormSchema = z.object({
  title: z.string().min(1, {
    error: "Title is required.",
  }),
  details: z.string().optional(),
  status: z.enum(TaskStatus).optional(),
  category: z.enum(TaskCategory, {
    error: (issue) =>
      issue.input === undefined ? "Category is required." : undefined,
  }),
  priority: z.enum(TaskPriority).optional(),

  // A deadline is a calendar day, so the picker submits `yyyy-MM-dd` and the
  // field travels as that string. See docs/calendar-days.md.
  dueDate: calendarDaySchema("A due date").optional(),

  assigneeId: z
    .cuid2({
      error: "Valid assignee ID is required.",
    })
    .optional(),
});
 
/**
 * The create form's extra rule: a new task cannot be born already overdue.
 *
 * `today` is a parameter because which day it is depends on the shelter's
 * timezone, which only the server can resolve. The action builds this schema
 * from the day it resolved, and the browser builds it from the day the server
 * handed down with the form — so both check the same boundary, and the action
 * is what decides.
 */
export const createTaskFormSchema = (today: CalendarDay) =>
  TaskFormSchema.refine((data) => !data.dueDate || data.dueDate >= today, {
    path: ["dueDate"],
    error: "Due date cannot be in the past.",
  });

export const NoteFormSchema = z.object({
  category: z.enum(NoteCategory),
  content: z.string().min(1, {
    error: "Content cannot be empty.",
  }),
});

export type TaskFormInput = z.input<typeof TaskFormSchema>;