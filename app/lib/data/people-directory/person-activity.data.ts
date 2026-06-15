import { prisma } from "@/app/lib/prisma";
import {
  IntakeType,
  OutcomeType,
  TaskStatus,
  NoteCategory,
  AssessmentOutcome,
} from "@prisma/client";
import { cuidSchema } from "../../zod-schemas/common.schemas";
import { Permissions } from "@/app/lib/auth/permissions";
import { RequirePermission } from "../../auth/protected-actions";

const PER_SOURCE_LIMIT = 15;

type AnimalRef = {
  id: string;
  name: string;
  species: { name: string };
};

const animalSelect = {
  id: true,
  name: true,
  species: { select: { name: true } },
} as const;

export type PersonActivityEntry =
  | {
      kind: "INTAKE_PROCESSED";
      date: Date;
      animal: AnimalRef;
      intakeType: IntakeType;
    }
  | {
      kind: "OUTCOME_PROCESSED";
      date: Date;
      animal: AnimalRef;
      outcomeType: OutcomeType;
    }
  | {
      kind: "TASK_CREATED";
      date: Date;
      animal: AnimalRef;
      title: string;
      status: TaskStatus;
    }
  | {
      kind: "TASK_ASSIGNED";
      date: Date;
      animal: AnimalRef;
      title: string;
      status: TaskStatus;
    }
  | {
      kind: "NOTE_AUTHORED";
      date: Date;
      animal: AnimalRef;
      category: NoteCategory;
      content: string;
    }
  | {
      kind: "ASSESSMENT_CONDUCTED";
      date: Date;
      animal: AnimalRef;
      overallOutcome: AssessmentOutcome | null;
      summary: string | null;
    };

const _fetchPersonActivity = async (
  inputPersonId: string,
): Promise<{ activity: PersonActivityEntry[] }> => {
  const parsedId = cuidSchema.safeParse(inputPersonId);

  if (!parsedId.success) {
    throw new Error("Invalid person ID format.");
  }

  const personId = parsedId.data;

  try {
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: {
        processedIntakes: {
          select: {
            intakeDate: true,
            type: true,
            animal: { select: animalSelect },
          },
          orderBy: { intakeDate: "desc" },
          take: PER_SOURCE_LIMIT,
        },
        processedOutcomes: {
          select: {
            outcomeDate: true,
            type: true,
            animal: { select: animalSelect },
          },
          orderBy: { outcomeDate: "desc" },
          take: PER_SOURCE_LIMIT,
        },
        tasksCreated: {
          select: {
            createdAt: true,
            title: true,
            status: true,
            animal: { select: animalSelect },
          },
          orderBy: { createdAt: "desc" },
          take: PER_SOURCE_LIMIT,
        },
        tasksAssigned: {
          select: {
            createdAt: true,
            title: true,
            status: true,
            animal: { select: animalSelect },
          },
          orderBy: { createdAt: "desc" },
          take: PER_SOURCE_LIMIT,
        },
        notesAuthored: {
          where: { deletedAt: null },
          select: {
            createdAt: true,
            category: true,
            content: true,
            animal: { select: animalSelect },
          },
          orderBy: { createdAt: "desc" },
          take: PER_SOURCE_LIMIT,
        },
        Assessment: {
          where: { deletedAt: null },
          select: {
            date: true,
            overallOutcome: true,
            summary: true,
            animal: { select: animalSelect },
          },
          orderBy: { date: "desc" },
          take: PER_SOURCE_LIMIT,
        },
      },
    });

    if (!person) {
      return { activity: [] };
    }

    const activity: PersonActivityEntry[] = [
      ...person.processedIntakes.map((intake) => ({
        kind: "INTAKE_PROCESSED" as const,
        date: intake.intakeDate,
        animal: intake.animal,
        intakeType: intake.type,
      })),
      ...person.processedOutcomes.map((outcome) => ({
        kind: "OUTCOME_PROCESSED" as const,
        date: outcome.outcomeDate,
        animal: outcome.animal,
        outcomeType: outcome.type,
      })),
      ...person.tasksCreated.map((task) => ({
        kind: "TASK_CREATED" as const,
        date: task.createdAt,
        animal: task.animal,
        title: task.title,
        status: task.status,
      })),
      ...person.tasksAssigned.map((task) => ({
        kind: "TASK_ASSIGNED" as const,
        date: task.createdAt,
        animal: task.animal,
        title: task.title,
        status: task.status,
      })),
      ...person.notesAuthored.map((note) => ({
        kind: "NOTE_AUTHORED" as const,
        date: note.createdAt,
        animal: note.animal,
        category: note.category,
        content: note.content,
      })),
      ...person.Assessment.map((assessment) => ({
        kind: "ASSESSMENT_CONDUCTED" as const,
        date: assessment.date,
        animal: assessment.animal,
        overallOutcome: assessment.overallOutcome,
        summary: assessment.summary,
      })),
    ];

    activity.sort((a, b) => b.date.getTime() - a.date.getTime());

    return { activity };
  } catch (error) {
    console.error("Error fetching person activity.", error);
    throw new Error("Could not fetch person activity.");
  }
};

export const fetchPersonActivity = RequirePermission(
  Permissions.PERSONS_READ_DETAIL,
)(_fetchPersonActivity);
