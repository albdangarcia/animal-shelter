import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { AnimalListingStatus, TaskStatus } from "@/prisma/generated/enums";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { RequireAllPermissions } from "../../auth/protected-actions";
import {
  ACUTE_HEALTH_STATUSES,
  buildAttentionQueue,
  type AttentionAnimal,
  type AttentionQueueItem,
} from "./attention-queue";

export type { AttentionQueueItem, AttentionReason } from "./attention-queue";

// Deliberate sibling of `fetchAnimalsRequiringAttention` in `analytics.data.ts`.
// That one is health-status-only and backs the dashboard health table; this one
// answers "what needs attention *today*" as a work queue whose every item clears
// when someone acts on it. Both
// exist on purpose — changing either would break the other's consumer.
//
// Signals:
//   1. Task overdue or due today (status TODO/IN_PROGRESS, dueDate <= end of today)
//   2. Acute health status (see ACUTE_HEALTH_STATUSES) with no open task
//   3. Open foster placement past its expectedEndDate
//
// Intended fourth signal, once it has data: missed medication —
// `MedicationSchedule` with no `MedicationLog` today. `MedicationSchedule` /
// `MedicationLog` exist in the schema but have no forms and no seed data, so a
// query against them would silently return nothing and look like it works.
//
// Queue-wide precondition: ARCHIVED animals (adopted / transferred / deceased)
// are excluded from every signal. Their state is frozen history — an item on
// one can never clear, which is exactly what this queue is defined against. A
// stray overdue task on an adopted animal is real data hygiene, but it is not
// animal care and does not belong here.

const OPEN_TASK_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

// Flattened animal-identity select, shared by all three signal queries.
const attentionAnimalSelect = {
  id: true,
  name: true,
  species: { select: { name: true } },
  currentUnit: {
    select: { name: true, location: { select: { name: true } } },
  },
} satisfies Prisma.AnimalSelect;

type AttentionAnimalRow = Prisma.AnimalGetPayload<{
  select: typeof attentionAnimalSelect;
}>;

// "Dog block A · A-3" — same "Location · Unit" convention as
// `app/lib/utils/location-activity.ts`. Null for fostered / unplaced animals.
const toAttentionAnimal = (animal: AttentionAnimalRow): AttentionAnimal => ({
  id: animal.id,
  name: animal.name,
  species: animal.species.name,
  currentUnit: animal.currentUnit
    ? `${animal.currentUnit.location.name} · ${animal.currentUnit.name}`
    : null,
});

// Exported unwrapped for the AI tool layer: a tool's `execute` runs
// mid-stream where `RequirePermission`'s ambient session read is unreliable.
// `getAttentionQueue` calls `requireFor` for both permissions
// itself before calling this. The `RequirePermission`-wrapped `fetchAttentionQueue`
// export below stays for server components.
export const _fetchAttentionQueue = async (): Promise<AttentionQueueItem[]> => {
  try {
    const now = new Date();
    // Signal 1 counts a task due at any point today ("<= end of today").
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    // Signal 3 is "expectedEndDate < today" — strictly before today, so a
    // placement expected to end today is not yet overdue.
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const notArchived = {
      listingStatus: { not: AnimalListingStatus.ARCHIVED },
    } satisfies Prisma.AnimalWhereInput;

    const [tasksDue, acuteHealth, fostersOverdue] = await Promise.all([
      // Signal 1. A null dueDate never satisfies `lte`, so undated backlog
      // tasks are excluded without an explicit filter.
      prisma.task.findMany({
        where: {
          status: { in: OPEN_TASK_STATUSES },
          dueDate: { lte: endOfToday },
          animal: notArchived,
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          animal: { select: attentionAnimalSelect },
        },
      }),
      // Signal 2. Acute health AND zero open tasks — an animal that needs care
      // and nobody has planned anything. Creating any task clears it.
      prisma.animal.findMany({
        where: {
          ...notArchived,
          healthStatus: { in: [...ACUTE_HEALTH_STATUSES] },
          tasks: { none: { status: { in: OPEN_TASK_STATUSES } } },
        },
        select: { ...attentionAnimalSelect, healthStatus: true },
      }),
      // Signal 3. Open placement (endDate == null) past its expected end.
      // One open placement per animal is an action-layer rule, not a DB
      // constraint — do not assume at most one row per animal.
      prisma.fosterPlacement.findMany({
        where: {
          endDate: null,
          expectedEndDate: { lt: startOfToday },
          animal: notArchived,
        },
        select: {
          id: true,
          expectedEndDate: true,
          animal: { select: attentionAnimalSelect },
          fosterProfile: {
            select: { person: { select: { name: true } } },
          },
        },
      }),
    ]);

    return buildAttentionQueue({
      tasksDue: tasksDue.map((task) => ({
        animal: toAttentionAnimal(task.animal),
        taskId: task.id,
        title: task.title,
        // `lte: endOfToday` guarantees a non-null dueDate here.
        dueDate: task.dueDate as Date,
        priority: task.priority,
      })),
      acuteHealth: acuteHealth.map((animal) => ({
        animal: toAttentionAnimal(animal),
        // `in: ACUTE_HEALTH_STATUSES` guarantees a non-null healthStatus here.
        healthStatus: animal.healthStatus!,
      })),
      fostersOverdue: fostersOverdue.map((placement) => ({
        animal: toAttentionAnimal(placement.animal),
        placementId: placement.id,
        expectedEndDate: placement.expectedEndDate as Date,
        fosterName: placement.fosterProfile.person.name,
      })),
    });
  } catch (error) {
    console.error("Error fetching the attention queue.", error);
    throw new Error("Error fetching the attention queue.");
  }
};

/**
 * `ANIMAL_INFO_READ` **and** `ANIMAL_TASK_READ`: the queue returns task detail
 * (titles, due dates, priorities) next to animal identity, so a caller needs
 * both reads. `RequirePermission` takes a single permission — `RequireAllPermissions`
 * is the and-composition.
 *
 * No actor-taking export yet
 */
export const fetchAttentionQueue = RequireAllPermissions(
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_TASK_READ,
)(_fetchAttentionQueue);
