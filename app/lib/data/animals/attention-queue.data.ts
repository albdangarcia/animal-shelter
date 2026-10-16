import prisma from "@/app/lib/prisma";
import type { Prisma } from "@/prisma/generated/client";
import { AnimalListingStatus, TaskStatus } from "@/prisma/generated/enums";
import { AppPermissions } from "@/app/lib/auth/permissions";
import {
  getShelterNow,
  getShelterSettings,
} from "@/app/lib/data/shelter-settings.data";
import { calendarDay } from "@/app/lib/utils/shelter-day";
import { RequireAllPermissions } from "../../auth/protected-actions";
import { findMedicalDueForQueue } from "../medical-due";
import { findUnplannedCareForQueue } from "../care-episodes";
import { findMissedDosesForQueue } from "../medication-doses";
import {
  attentionUnitLabel,
  buildAttentionQueue,
  type AttentionAnimal,
  type AttentionQueueItem,
} from "./attention-queue";

export type { AttentionQueueItem, AttentionReason } from "./attention-queue";

// Not the dashboard's list of animals under care (`fetchAnimalsUnderCare` in
// `analytics.data.ts`), which shows every open care episode whatever is
// planned for it. This one answers "what needs attention *today*" as a work
// queue whose every item clears when someone acts on it.
//
// Signals:
//   1. Task overdue or due today (status TODO/IN_PROGRESS, dueDate <= today)
//   2. Medication dose slots missed yesterday or today: a slot an order
//      expects whose window has ended on the shelter's clock with no dose
//      recorded, read by `findMissedDosesForQueue`. Refused and not given
//      account for their slot.
//   3. Scheduled medical care overdue or due today (status SCHEDULED, not
//      voided, dueDate <= today), read by `findMedicalDueForQueue`
//   4. An open care episode with nothing planned: no open task, no
//      scheduled care and no medication order running, read by
//      `findUnplannedCareForQueue`
//   5. Open foster placement past its expectedEndDate
//
// Queue-wide precondition: ARCHIVED animals (adopted / transferred / deceased)
// are excluded from every signal. Their state is frozen history — an item on
// one can never clear, which is exactly what this queue is defined against. A
// stray overdue task on an adopted animal is real data hygiene, but it is not
// animal care and does not belong here.

const OPEN_TASK_STATUSES = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

// Flattened animal-identity select, shared by the task and foster queries.
// The medical and care queries have their own, in auth-free modules.
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

const toAttentionAnimal = (animal: AttentionAnimalRow): AttentionAnimal => ({
  id: animal.id,
  name: animal.name,
  species: animal.species.name,
  currentUnit: attentionUnitLabel(animal.currentUnit),
});

// Exported unwrapped for the AI tool layer: a tool's `execute` runs
// mid-stream where `RequirePermission`'s ambient session read is unreliable.
// `getAttentionQueue` calls `requireFor` for each of its permissions
// itself before calling this. The `RequirePermission`-wrapped `fetchAttentionQueue`
// export below stays for server components.
export const _fetchAttentionQueue = async (): Promise<AttentionQueueItem[]> => {
  try {
    // Every deadline column holds a calendar day, so each boundary is one
    // day compared as a plain string — resolved on the shelter's calendar,
    // which is the only place "today" means anything here.
    //
    // Signals 1 and 3 count anything due at any point today, so `<= today`.
    // Signal 5 is strictly before today, so a placement expected to end today
    // is not yet overdue. Signal 2 reads the clock too, to tell which of
    // today's slots have ended: one reading gives both, so they agree on the
    // day.
    const [{ today, clock }, { doseSlotEnds }] = await Promise.all([
      getShelterNow(),
      getShelterSettings(),
    ]);

    const notArchived = {
      listingStatus: { not: AnimalListingStatus.ARCHIVED },
    } satisfies Prisma.AnimalWhereInput;

    const [tasksDue, dosesMissed, medicalDue, careUnplanned, fostersOverdue] = await Promise.all([
      // Signal 1. A null dueDate never satisfies `lte`, so undated backlog
      // tasks are excluded without an explicit filter.
      prisma.task.findMany({
        where: {
          status: { in: OPEN_TASK_STATUSES },
          dueDate: { lte: today },
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
      // Signal 2. Archived animals are left out there too.
      findMissedDosesForQueue(prisma, clock, doseSlotEnds),
      // Signal 3. Archived animals are left out there too.
      findMedicalDueForQueue(prisma, today),
      // Signal 4. Under care AND nothing planned — an animal that needs care
      // and nobody has planned anything. Creating a task, scheduling care or
      // ordering a medication clears it. Archived animals are left out there
      // too.
      findUnplannedCareForQueue(prisma, today),
      // Signal 5. Open placement (endDate == null) past its expected end.
      // One open placement per animal is an action-layer rule, not a DB
      // constraint — do not assume at most one row per animal.
      prisma.fosterPlacement.findMany({
        where: {
          endDate: null,
          expectedEndDate: { lt: today },
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
        // `lte: today` guarantees a non-null dueDate here.
        dueDate: calendarDay(task.dueDate!),
        priority: task.priority,
      })),
      dosesMissed,
      medicalDue,
      careUnplanned,
      fostersOverdue: fostersOverdue.map((placement) => ({
        animal: toAttentionAnimal(placement.animal),
        placementId: placement.id,
        expectedEndDate: calendarDay(placement.expectedEndDate!),
        fosterName: placement.fosterProfile.person.name,
      })),
    });
  } catch (error) {
    console.error("Error fetching the attention queue.", error);
    throw new Error("Error fetching the attention queue.");
  }
};

/**
 * `ANIMAL_INFO_READ`, `ANIMAL_TASK_READ` **and** `MEDICAL_READ`: the queue
 * returns task detail (titles, due dates, priorities), missed medication
 * doses and scheduled medical care next to animal identity, so a caller needs
 * all three reads.
 * `RequirePermission` takes a single permission — `RequireAllPermissions` is
 * the and-composition.
 *
 * No actor-taking export yet
 */
export const fetchAttentionQueue = RequireAllPermissions(
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_TASK_READ,
  AppPermissions.MEDICAL_READ,
)(_fetchAttentionQueue);
