import type {
  AnimalListingStatus,
  CareEpisodeType,
  AnimalSize,
  FosterPlacementType,
  IntakeType,
  Sex,
  SurgeryProcedure,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from "@/prisma/generated/enums";
import type { AiAnimalSummaryRow } from "@/app/lib/data/animals/animal.data";
import type { ReadinessLine } from "./animal-readiness";
import type { CareStatus } from "@/app/lib/utils/care-status";

/**
 * `getAnimalSummary`'s result. Hand-written, not `Prisma.AnimalGetPayload`
 * Field policy: ids and display names only — no microchip number,
 * no foster contact details, no address, no adoption applications.
 *
 * All dates are ISO strings; `birthDate` is date-only. The system prompt
 * states today's date so the model can judge what is overdue.
 */
export type AnimalSummary = {
  animalId: string;
  name: string;
  species: string;
  breeds: string[];
  primaryColor: string | null;
  sex: Sex;
  birthDate: string;
  size: AnimalSize | null;
  listingStatus: AnimalListingStatus;
  currentUnit: string | null;
  currentFoster: {
    personId: string;
    personName: string;
    placementType: FosterPlacementType;
    startDate: string;
    expectedEndDate: string | null;
  } | null;
  openTasks: AnimalSummaryTask[];
  latestIntake: { date: string; type: IntakeType } | null;
  /** Null when the viewer can't read readiness (it needs the assessment and
   *  characteristic reads on top of the animal record). */
  readiness: ReadinessLine | null;
  /** Null when the viewer can't read the medical record. */
  care: AnimalSummaryCare | null;
};

/** The care the animal is under, from its medical record. */
export type AnimalSummaryCare = {
  /** Its open care episode: under vet care, or hospitalised in house or at
   *  a clinic, since `startDate`. */
  episode: {
    type: CareEpisodeType;
    startDate: string;
    clinic: string | null;
  } | null;
  /** A surgery in the last two weeks. */
  recovering: { procedure: SurgeryProcedure; surgeryDate: string } | null;
  /** Exams and surgery scheduled for it, the earliest of each: `kind` is
   *  what is awaited ("vet exam", "spay", "surgery (mass removal)"), and
   *  `overdue` is stated, not left to date arithmetic. */
  awaiting: { kind: string; dueDate: string; overdue: boolean }[];
  /** Active and chronic allergies. */
  allergies: string[];
  /** Active and chronic conditions. */
  conditions: string[];
};

export type AnimalSummaryTask = {
  taskId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueDate: string | null;
};

function formatUnit(
  unit: { name: string; location: { name: string } } | null,
): string | null {
  return unit ? `${unit.location.name} · ${unit.name}` : null;
}

export function toAnimalSummaryCare(care: CareStatus): AnimalSummaryCare {
  const { exam, surgery, spayNeuter } = care.awaiting;
  return {
    episode: care.episode
      ? {
          type: care.episode.type,
          startDate: care.episode.startDate,
          clinic: care.episode.clinicName,
        }
      : null,
    recovering: care.recovering
      ? {
          procedure: care.recovering.procedure,
          surgeryDate: care.recovering.surgeryDate,
        }
      : null,
    awaiting: [exam, surgery, spayNeuter].flatMap((awaited) =>
      awaited
        ? [{ kind: awaited.label, dueDate: awaited.dueDate, overdue: awaited.overdue }]
        : [],
    ),
    allergies: care.allergies.map((allergy) => allergy.name),
    conditions: care.conditions.map((condition) => condition.name),
  };
}

export function toAnimalSummary(
  row: AiAnimalSummaryRow,
  readiness: ReadinessLine | null,
  care: CareStatus | null,
): AnimalSummary {
  const foster = row.fosterPlacements[0] ?? null;

  return {
    animalId: row.id,
    name: row.name,
    species: row.species.name,
    breeds: row.breeds.map((b) => b.name),
    primaryColor: row.primaryColor?.name ?? null,
    sex: row.sex,
    birthDate: row.birthDate,
    size: row.size,
    listingStatus: row.listingStatus,
    currentUnit: formatUnit(row.currentUnit),
    currentFoster: foster
      ? {
          personId: foster.fosterProfile.person.id,
          personName: foster.fosterProfile.person.name,
          placementType: foster.type,
          startDate: foster.startDate,
          expectedEndDate: foster.expectedEndDate,
        }
      : null,
    openTasks: row.tasks.map((task) => ({
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      category: task.category,
      dueDate: task.dueDate,
    })),
    latestIntake: row.intake[0]
      ? {
          date: row.intake[0].intakeDate,
          type: row.intake[0].type,
        }
      : null,
    readiness,
    care: care ? toAnimalSummaryCare(care) : null,
  };
}
