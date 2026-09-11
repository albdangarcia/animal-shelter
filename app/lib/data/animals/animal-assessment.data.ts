import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { AssessmentSignal } from "@/prisma/generated/enums";
import z from "zod";
import {
  cuidSchema,
  currentPageSchema,
} from "../../zod-schemas/common.schemas";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";
import {
  ASSESSMENT_TEMPLATES,
  type AssessmentTemplateDef,
} from "../../assessments/templates";
import {
  summarizeAssessmentCharacteristics,
  type AssessmentCharacteristicsSummary,
} from "../../assessments/proposals";
import {
  fetchAnimalFindings,
  RECORDED_FINDINGS_SELECT,
  toRecordedAssessment,
} from "./assessment-characteristic-review";

const ASSESSMENTS_PER_PAGE = 5;

const ANSWER_SELECT = {
  id: true,
  questionLabel: true,
  value: true,
  valueNumber: true,
  notes: true,
  templateField: { select: { key: true, order: true } },
} satisfies Prisma.AssessmentAnswerSelect;

export type AnimalAssessmentListItem = Prisma.AssessmentGetPayload<{
  select: {
    id: true;
    observedAt: true;
    signal: true;
    summary: true;
    deletedAt: true;
    assessor: { select: { name: true } };
    template: { select: { key: true; name: true; version: true } };
  };
}>;

const listArgsSchema = z.object({
  animalId: cuidSchema,
  currentPage: currentPageSchema,
  signal: z.string().optional(),
  status: z.string().optional(),
  sort: z.string().optional(),
});

const _fetchAnimalAssessments = async (
  animalId: string,
  currentPageInput: number,
  signalInput: string | undefined,
  statusInput: string | undefined,
  sortInput: string | undefined,
): Promise<{
  assessments: AnimalAssessmentListItem[];
  totalPages: number;
}> => {
  const parsed = listArgsSchema.safeParse({
    animalId,
    currentPage: currentPageInput,
    signal: signalInput,
    status: statusInput,
    sort: sortInput,
  });
  if (!parsed.success) {
    throw new Error("Invalid arguments for fetching animal assessments.");
  }

  const { currentPage, signal, status, sort } = parsed.data;

  const direction: "asc" | "desc" =
    sort?.split(".")[1] === "asc" ? "asc" : "desc";
  const orderBy: Prisma.AssessmentOrderByWithRelationInput =
    sort?.split(".")[0] === "signal"
      ? { signal: direction }
      : { observedAt: direction };

  // Status filter mirrors the vitals log: default and "active" → non-deleted,
  // "deleted" alone → deleted, both → all.
  const selected = status ? status.split(",").filter(Boolean) : [];
  const wantsActive = selected.includes("active");
  const wantsDeleted = selected.includes("deleted");
  let deletedFilter: Prisma.AssessmentWhereInput;
  if (wantsDeleted && !wantsActive) {
    deletedFilter = { deletedAt: { not: null } };
  } else if (wantsActive && wantsDeleted) {
    deletedFilter = {};
  } else {
    deletedFilter = { deletedAt: null };
  }

  const where: Prisma.AssessmentWhereInput = {
    animalId,
    ...deletedFilter,
    ...(signal && {
      signal: {
        in: signal
          .split(",")
          .filter((s): s is AssessmentSignal =>
            (Object.values(AssessmentSignal) as string[]).includes(s),
          ),
      },
    }),
  };

  try {
    const offset = (currentPage - 1) * ASSESSMENTS_PER_PAGE;
    const [totalCount, assessments] = await Promise.all([
      prisma.assessment.count({ where }),
      prisma.assessment.findMany({
        where,
        select: {
          id: true,
          observedAt: true,
          signal: true,
          summary: true,
          deletedAt: true,
          assessor: { select: { name: true } },
          template: { select: { key: true, name: true, version: true } },
        },
        orderBy,
        take: ASSESSMENTS_PER_PAGE,
        skip: offset,
      }),
    ]);

    return {
      assessments,
      totalPages: Math.ceil(totalCount / ASSESSMENTS_PER_PAGE),
    };
  } catch (error) {
    console.error("Error fetching animal assessments:", error);
    throw new Error("Error fetching animal assessments.");
  }
};

export type AnimalAssessmentFormData = Prisma.AssessmentGetPayload<{
  select: {
    id: true;
    animalId: true;
    observedAt: true;
    signal: true;
    summary: true;
    template: { select: { key: true; version: true; name: true } };
    answers: {
      select: {
        value: true;
        valueNumber: true;
        notes: true;
        templateField: { select: { key: true } };
      };
    };
  };
}>;

const _fetchAnimalAssessmentById = async (
  assessmentId: string,
): Promise<AnimalAssessmentFormData | null> => {
  const parsed = cuidSchema.safeParse(assessmentId);
  if (!parsed.success) return null;

  try {
    return await prisma.assessment.findFirst({
      where: { id: parsed.data, deletedAt: null },
      select: {
        id: true,
        animalId: true,
        observedAt: true,
        signal: true,
        summary: true,
        template: { select: { key: true, version: true, name: true } },
        answers: {
          select: {
            value: true,
            valueNumber: true,
            notes: true,
            templateField: { select: { key: true } },
          },
        },
      },
    });
  } catch (error) {
    console.error(`Error fetching assessment ${assessmentId}:`, error);
    throw new Error("Error fetching assessment.");
  }
};

export interface AssessmentAnimalContext {
  id: string;
  name: string;
  speciesName: string;
  /** The active templates that apply to this animal, in registry order. */
  templates: AssessmentTemplateDef[];
}

/**
 * The animal identity plus the set of active templates whose species scope
 * covers it — everything the record form needs that isn't the assessment
 * itself. Returns `null` when the animal doesn't exist.
 */
const _fetchAssessmentAnimalContext = async (
  animalId: string,
): Promise<AssessmentAnimalContext | null> => {
  const parsed = cuidSchema.safeParse(animalId);
  if (!parsed.success) return null;

  try {
    const animal = await prisma.animal.findUnique({
      where: { id: parsed.data },
      select: { id: true, name: true, species: { select: { name: true } } },
    });
    if (!animal) return null;

    const speciesName = animal.species.name;
    const templates = ASSESSMENT_TEMPLATES.filter(
      (t) =>
        t.isActive !== false && (!t.species || t.species === speciesName),
    );

    return { id: animal.id, name: animal.name, speciesName, templates };
  } catch (error) {
    console.error(
      `Error fetching assessment context for animal ${animalId}:`,
      error,
    );
    throw new Error("Error fetching assessment context.");
  }
};

const DETAIL_SELECT = {
  id: true,
  observedAt: true,
  signal: true,
  summary: true,
  deletedAt: true,
  animal: { select: { name: true } },
  assessor: { select: { name: true } },
  template: {
    select: {
      key: true,
      name: true,
      version: true,
      fields: RECORDED_FINDINGS_SELECT.template.select.fields,
    },
  },
  answers: {
    select: ANSWER_SELECT,
    orderBy: { templateField: { order: "asc" } },
  },
} satisfies Prisma.AssessmentSelect;

export type AssessmentDetail = Prisma.AssessmentGetPayload<{
  select: typeof DETAIL_SELECT;
}> &
  AssessmentCharacteristicsSummary;

/**
 * One assessment as its own record: the read-only findings plus what its
 * findings suggest about the animal's characteristics. Deleted assessments
 * are returned too — a characteristic can still cite one, and the page is
 * where staff restore it.
 */
const _fetchAssessmentDetail = async (
  animalId: string,
  assessmentId: string,
): Promise<AssessmentDetail | null> => {
  if (
    !cuidSchema.safeParse(animalId).success ||
    !cuidSchema.safeParse(assessmentId).success
  ) {
    return null;
  }

  try {
    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, animalId },
      select: DETAIL_SELECT,
    });
    if (!assessment) return null;

    const summary = summarizeAssessmentCharacteristics({
      assessment: toRecordedAssessment(assessment),
      deleted: assessment.deletedAt !== null,
      ...(await fetchAnimalFindings(prisma, animalId)),
    });
    return { ...assessment, ...summary };
  } catch (error) {
    console.error(`Error fetching assessment ${assessmentId}:`, error);
    throw new Error("Error fetching assessment.");
  }
};

export const fetchAnimalAssessments = RequirePermission(
  AppPermissions.ANIMAL_ASSESSMENT_READ,
)(_fetchAnimalAssessments);

export const fetchAssessmentDetail = RequirePermission(
  AppPermissions.ANIMAL_ASSESSMENT_READ,
)(_fetchAssessmentDetail);

export const fetchAnimalAssessmentById = RequirePermission(
  AppPermissions.ANIMAL_ASSESSMENT_READ,
)(_fetchAnimalAssessmentById);

export const fetchAssessmentAnimalContext = RequirePermission(
  AppPermissions.ANIMAL_ASSESSMENT_READ,
)(_fetchAssessmentAnimalContext);
