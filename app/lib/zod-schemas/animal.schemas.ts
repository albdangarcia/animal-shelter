import { z } from "zod";
import {
  Sex,
  AnimalHealthStatus,
  IntakeType,
  TaskStatus,
  TaskCategory,
  TaskPriority,
  NoteCategory,
  AnimalListingStatus,
} from "@prisma/client";
import { US_STATES } from "@/app/lib/constants/us-states";
import {
  cuidSchema,
  currentPageSchema,
  pageSizeSchema,
  searchQuerySchema,
} from "./common.schemas";

const speciesNameSchema = z
  .string()
  .max(50, {
    error: "Species name must be at most 50 characters long.",
  })
  .optional();

export const PublishedPetsSchema = z.object({
  query: searchQuerySchema,
  currentPage: currentPageSchema,
  speciesName: speciesNameSchema,
});

export const sortSchema = z
  .string()
  .regex(/^\w+\.(asc|desc)$/, {
    error: "Sort must be in 'field.direction' format",
  })
  .optional();

export const MyApplicationsSchema = z.object({
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

const stateCodes = US_STATES.map((state) => state.code) as [
  string,
  ...string[]
];

export const AnimalFormSchema = z
  .object({
    // Core Animal Details
    animalName: z.string().min(1, {
      error: "Animal name is required.",
    }),
    species: z.cuid({
      error: "A valid species ID is required.",
    }),
    breed: z.cuid({
      error: "A valid primary breed ID is required.",
    }),
    primaryColor: z.cuid({
      error: "A valid primary color ID is required.",
    }),
    sex: z.enum(Sex, {
      error: (issue) =>
        issue.input === undefined ? "Sex is required." : undefined,
    }),
    estimatedBirthDate: z.coerce.date({
      error: (issue) =>
        issue.input === undefined
          ? "Estimated birth date is required."
          : undefined,
    }),
    healthStatus: z.enum(AnimalHealthStatus, {
      error: (issue) =>
        issue.input === undefined ? "Health status is required." : undefined,
    }),
    listingStatus: z.enum(AnimalListingStatus, {
      error: (issue) =>
        issue.input === undefined ? "Listing status is required." : undefined,
    }),
    weightKg: z.coerce
      .number({
        error: (issue) =>
          issue.input === undefined ? undefined : "Weight must be a number.",
      })
      .positive({
        error: "Weight must be a positive number.",
      })
      .optional()
      .or(z.literal("")),
    heightCm: z.coerce
      .number({
        error: (issue) =>
          issue.input === undefined ? undefined : "Height must be a number.",
      })
      .positive({
        error: "Height must be a positive number.",
      })
      .optional()
      .or(z.literal("")),
    microchipNumber: z.string().optional(),
    description: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),

    // Intake-Only Details
    intakeType: z.enum(IntakeType).optional(),
    intakeDate: z.coerce.date().optional(),
    notes: z.string().optional(),
    sourcePartnerId: z.cuid().optional().or(z.literal("")),
    foundAddress: z.string().optional(),
    foundCity: z.string().optional(),
    foundState: z.string().optional(),
    surrenderingPersonName: z.string().optional(),
    surrenderingPersonPhone: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.intakeType === "TRANSFER_IN" && !data.sourcePartnerId) {
      ctx.addIssue({
        code: "custom",
        message: "Source partner is required for transfers.",
        path: ["sourcePartnerId"],
      });
    }

    if (data.intakeType === "OWNER_SURRENDER" && !data.surrenderingPersonName) {
      ctx.addIssue({
        code: "custom",
        message: "Surrenderer's name is required for owner surrenders.",
        path: ["surrenderingPersonName"],
      });
    }

    if (data.intakeType === "STRAY") {
      if (!data.foundAddress) {
        ctx.addIssue({
          code: "custom",
          message: "Address is required for strays.",
          path: ["foundAddress"],
        });
      }
      if (!data.foundCity) {
        ctx.addIssue({
          code: "custom",
          message: "City is required for strays.",
          path: ["foundCity"],
        });
      }
      if (!data.foundState) {
        ctx.addIssue({
          code: "custom",
          message: "State is required for strays.",
          path: ["foundState"],
        });
      } else if (!stateCodes.includes(data.foundState)) {
        ctx.addIssue({
          code: "custom",
          message: "Please select a valid US state.",
          path: ["foundState"],
        });
      }
    }
  });

export const TaskFormSchema = z
  .object({
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
    dueDate: z.coerce.date().optional(),
    assigneeId: z
      .cuid({
        error: "Valid assignee ID is required.",
      })
      .optional(),
  })
  .refine(
    (data) => {
      // If a due date is provided, it must not be in the past.
      if (data.dueDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to the beginning of today
        return data.dueDate >= today;
      }
      // If no due date is provided, the validation passes.
      return true;
    },
    {
      path: ["dueDate"],
      error: "Due date cannot be in the past.",
    }
  );

export const NoteFormSchema = z.object({
  category: z.enum(NoteCategory),
  content: z.string().min(1, {
    error: "Content cannot be empty.",
  }),
});

export const assessmentFieldSchema = z.object({
  fieldName: z.string().min(1, { error: "Field name cannot be empty." }),
  fieldValue: z.string().min(1, { error: "Field value cannot be empty." }),
  notes: z.string().optional(),
});
