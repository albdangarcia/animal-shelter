import type {
  AnimalHealthStatus,
  AnimalListingStatus,
  AnimalSize,
  FosterPlacementType,
  IntakeType,
  Sex,
  TaskCategory,
  TaskPriority,
  TaskStatus,
} from "@/prisma/generated/enums";
import type { AiAnimalSummaryRow } from "@/app/lib/data/animals/animal.data";

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
  healthStatus: AnimalHealthStatus | null;
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

export function toAnimalSummary(row: AiAnimalSummaryRow): AnimalSummary {
  const foster = row.fosterPlacements[0] ?? null;

  return {
    animalId: row.id,
    name: row.name,
    species: row.species.name,
    breeds: row.breeds.map((b) => b.name),
    primaryColor: row.primaryColor?.name ?? null,
    sex: row.sex,
    birthDate: row.birthDate.toISOString().slice(0, 10),
    size: row.size,
    healthStatus: row.healthStatus,
    listingStatus: row.listingStatus,
    currentUnit: formatUnit(row.currentUnit),
    currentFoster: foster
      ? {
          personId: foster.fosterProfile.person.id,
          personName: foster.fosterProfile.person.name,
          placementType: foster.type,
          startDate: foster.startDate.toISOString(),
          expectedEndDate: foster.expectedEndDate?.toISOString() ?? null,
        }
      : null,
    openTasks: row.tasks.map((task) => ({
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      category: task.category,
      dueDate: task.dueDate?.toISOString() ?? null,
    })),
    latestIntake: row.intake[0]
      ? {
          date: row.intake[0].intakeDate.toISOString(),
          type: row.intake[0].type,
        }
      : null,
  };
}
