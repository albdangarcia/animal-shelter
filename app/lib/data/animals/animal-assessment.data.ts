import { prisma } from "@/app/lib/prisma";
import { Prisma, AssessmentType, AssessmentOutcome } from "@prisma/client";
import z from "zod";
import {
  cuidSchema,
  currentPageSchema,
} from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";

export type AssessmentTemplateWithFields = Prisma.AssessmentTemplateGetPayload<{
  include: {
    templateFields: {
      orderBy: { order: "asc" };
    };
  };
}>;

const ASSESSMENTS_PER_PAGE = 5;

const _fetchAssessmentTemplates = async (): Promise<
  AssessmentTemplateWithFields[]
> => {
  try {
    const templates = await prisma.assessmentTemplate.findMany({
      include: {
        templateFields: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return templates;
  } catch (error) {
    console.error("Error fetching assessment templates:", error);
    throw new Error("Could not fetch assessment templates from the database.");
  }
};

export type AnimalAssessmentListPayload = Prisma.AssessmentGetPayload<{
  select: {
    id: true;
    date: true;
    overallOutcome: true;
    summary: true;
    deletedAt: true; // Needed for the "Show Deleted" filter logic
    assessor: {
      select: { name: true }; // Only need the name
    };
    template: {
      select: { type: true }; // Only need the type
    };
    fields: {
      select: {
        id: true;
        fieldName: true;
        fieldValue: true;
        notes: true;
      };
    };
  };
}>;

export const AnimalAssessmentsSchema = z.object({
  currentPage: currentPageSchema,
  animalId: cuidSchema,
  type: z.string().optional(),
  outcome: z.string().optional(),
  sort: z.string().optional(),
  showDeleted: z.boolean().optional(),
});

const _fetchAnimalAssessments = async (
  animalId: string,
  currentPageInput: number,
  typeInput: string | undefined,
  outcomeInput: string | undefined,
  sortInput: string | undefined,
  showDeletedInput: boolean = false
): Promise<{ assessments: AnimalAssessmentListPayload[]; totalPages: number }> => {
  // Validate and parse inputs
  const validatedArgs = AnimalAssessmentsSchema.safeParse({
    currentPage: currentPageInput,
    animalId: animalId,
    type: typeInput,
    outcome: outcomeInput,
    sort: sortInput,
    showDeleted: showDeletedInput,
  });
  if (!validatedArgs.success) {
    throw new Error("Invalid arguments for fetching animal assessments.");
  }

  const { currentPage, type, outcome, sort, showDeleted } = validatedArgs.data;
  // Determine the sorting order, defaulting to newest first
  const orderBy: Prisma.AssessmentOrderByWithRelationInput = (() => {
    if (!sort) return { date: "desc" };
    const [id, dir] = sort.split(".");
    return { [id]: dir === "desc" ? "desc" : "asc" };
  })();
  // Construct the 'where' clause based on filters
  const whereClause: Prisma.AssessmentWhereInput = {
    animalId: animalId,
    ...(type && {
      template: {
        type: { in: type.split(",") as AssessmentType[] },
      },
    }),
    ...(outcome && {
      overallOutcome: { in: outcome.split(",") as AssessmentOutcome[] },
    }),
    ...(showDeleted ? {} : { deletedAt: null }),
  };
  try {
    const offset = (currentPage - 1) * ASSESSMENTS_PER_PAGE;
    const [totalCount, assessments] = await Promise.all([
      prisma.assessment.count({ where: whereClause }),
      prisma.assessment.findMany({
        where: whereClause,
        select: {
          id: true,
          date: true,
          overallOutcome: true,
          summary: true,
          deletedAt: true,
          assessor: { select: { name: true } },
          template: { select: { type: true } },
          fields: {
            select: {
              id: true,
              fieldName: true,
              fieldValue: true,
              notes: true,
            },
          },
        },
        orderBy: orderBy,
        take: ASSESSMENTS_PER_PAGE,
        skip: offset,
      }),
    ]);
    const totalPages = Math.ceil(totalCount / ASSESSMENTS_PER_PAGE);
    return { assessments, totalPages };
  } catch (error) {
    console.error("Error fetching animal assessments:", error);
    throw new Error("Error fetching animal assessments.");
  }
};

export type AnimalAssessmentFormPayload = Prisma.AssessmentGetPayload<{
  select: {
    id: true;
    overallOutcome: true;
    summary: true;
    template: {
      select: { id: true };
    };
    fields: {
      select: {
        fieldName: true;
        fieldValue: true;
        notes: true;
      };
    };
  };
}>;

const _fetchAnimalAssessmentById = async (
  id: string
): Promise<AnimalAssessmentFormPayload | null> => {
  try {
    const assessment = await prisma.assessment.findUnique({
      where: { id },
      select: {
        id: true,
        overallOutcome: true,
        summary: true,
        template: {
          select: { id: true },
        },
        fields: {
          select: {
            fieldName: true,
            fieldValue: true,
            notes: true,
          },
        },
      },
    });
    return assessment;
  } catch (error) {
    console.error(`Error fetching assessment with ID ${id}:`, error);
    throw new Error(`Error fetching assessment.`);
  }
};

export const fetchAnimalAssessmentById = RequirePermission(
  AppPermissions.ANIMAL_ASSESSMENT_READ
)(_fetchAnimalAssessmentById);

export const fetchAssessmentTemplates = RequirePermission(
  AppPermissions.ANIMAL_ASSESSMENT_READ
)(_fetchAssessmentTemplates);

export const fetchAnimalAssessments = RequirePermission(
  AppPermissions.ANIMAL_ASSESSMENT_READ
)(_fetchAnimalAssessments);
