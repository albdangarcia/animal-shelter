// Pure merge/sort/dedupe logic for the attention queue — no Prisma imports, so
// it is trivially unit-testable (see `attention-queue.test.ts`). The query in
// `attention-queue.data.ts` stays dumb: it fetches the four candidate row sets
// and hands them here. This split is the shape recommended by
// `docs/specs/ai-chat/03-attention-queue.md` §Acceptance.

import type {
  CareEpisodeType,
  DoseSlot,
  MedicalEntryKind,
  TaskPriority,
} from "@/prisma/generated/enums";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

/** The queue is capped so it stays a scannable worklist, not a report. */
export const ATTENTION_QUEUE_CAP = 20;

// HIGH sorts ahead of MEDIUM ahead of LOW within a due-date tie.
const PRIORITY_RANK: Record<TaskPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/** The animal identity every reason is attached to. `species` and `currentUnit`
 * are already flattened to display strings by the query layer. */
export type AttentionAnimal = {
  id: string;
  name: string;
  species: string;
  currentUnit: string | null; // "Dog block A · A-3" or null (fostered / unplaced)
};

/**
 * "Dog block A · A-3": the same "Location · Unit" convention as
 * `app/lib/utils/location-activity.ts`. Null for an animal in no unit
 * (fostered or unplaced). Shared by every signal's query, including the
 * medical one in `app/lib/data/medical-due.ts`.
 */
export const attentionUnitLabel = (
  unit: { name: string; location: { name: string } } | null,
): string | null => (unit ? `${unit.location.name} · ${unit.name}` : null);

export type TaskDueRow = {
  animal: AttentionAnimal;
  taskId: string;
  title: string;
  dueDate: CalendarDay;
  priority: TaskPriority;
};

/** Scheduled care due today or overdue. */
export type MedicalDueRow = {
  animal: AttentionAnimal;
  entryId: string;
  itemName: string;
  kind: MedicalEntryKind;
  dueDate: CalendarDay;
};

/** Medication dose slots missed yesterday or today, for one animal: how
 * many, the earliest, and the medications they were of. */
export type MissedDoseRow = {
  animal: AttentionAnimal;
  count: number;
  earliest: { slotDate: CalendarDay; slot: DoseSlot };
  medications: string[];
};

/** An open care episode on an animal with nothing planned for it: no open
 * task and no scheduled care. */
export type CareUnplannedRow = {
  animal: AttentionAnimal;
  episodeId: string;
  episodeType: CareEpisodeType;
  startDate: CalendarDay;
};

export type FosterOverdueRow = {
  animal: AttentionAnimal;
  placementId: string;
  expectedEndDate: CalendarDay;
  fosterName: string; // person's display name only — no email/phone/address
};

// Structured reasons, not pre-formatted strings: a dashboard card and an AI
// tool want different wording from the same data.
export type AttentionReason =
  | {
      kind: "TASK_DUE";
      taskId: string;
      title: string;
      dueDate: CalendarDay;
      priority: TaskPriority;
    }
  | {
      kind: "MEDICAL_DUE";
      entryId: string;
      itemName: string;
      entryKind: MedicalEntryKind;
      dueDate: CalendarDay;
    }
  | {
      kind: "CARE_UNPLANNED";
      episodeId: string;
      episodeType: CareEpisodeType;
      startDate: CalendarDay;
    }
  | {
      kind: "FOSTER_OVERDUE";
      placementId: string;
      expectedEndDate: CalendarDay;
      fosterName: string;
    };

export type AttentionQueueItem = {
  animalId: string;
  name: string;
  species: string;
  currentUnit: string | null;
  reasons: AttentionReason[];
};

// An animal's tier is its most time-sensitive reason. Lower = surfaced first.
const TIER = {
  TASK_DUE: 1,
  MEDICAL_DUE: 2,
  CARE_UNPLANNED: 3,
  FOSTER_OVERDUE: 4,
} as const;

function reasonTier(reason: AttentionReason): number {
  return TIER[reason.kind];
}

// Order reasons within a single animal: overdue tasks first (earliest due, then
// priority), then medical care (earliest due), then care with nothing
// planned (an animal has at most one open episode), then foster.
// Deterministic.
function compareReasons(a: AttentionReason, b: AttentionReason): number {
  const byTier = reasonTier(a) - reasonTier(b);
  if (byTier !== 0) return byTier;
  if (a.kind === "TASK_DUE" && b.kind === "TASK_DUE") {
    // `yyyy-MM-dd` days sort chronologically as plain strings.
    const byDue = a.dueDate.localeCompare(b.dueDate);
    if (byDue !== 0) return byDue;
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return a.taskId.localeCompare(b.taskId);
  }
  if (a.kind === "MEDICAL_DUE" && b.kind === "MEDICAL_DUE") {
    return (
      a.dueDate.localeCompare(b.dueDate) || a.entryId.localeCompare(b.entryId)
    );
  }
  return 0;
}

/**
 * Merge the four signal row sets into one deduplicated, ordered, capped list.
 *
 * An animal appears **once**, carrying every reason it matched. Sort tiers
 * (`docs/specs/ai-chat/03-attention-queue.md` §Sort order, with scheduled
 * medical care added after tasks):
 *   1. has an overdue/due-today task — by earliest due date, then priority
 *   2. has scheduled medical care overdue or due today — by earliest due date
 *   3. is under an open care episode with nothing planned (no open task, no
 *      scheduled care) — by the episode's start
 *   4. overdue foster placement — by earliest expected end date
 * An animal in more than one tier sorts by its highest (lowest-numbered) tier.
 */
export function buildAttentionQueue(input: {
  tasksDue: TaskDueRow[];
  medicalDue: MedicalDueRow[];
  careUnplanned: CareUnplannedRow[];
  fostersOverdue: FosterOverdueRow[];
}): AttentionQueueItem[] {
  const byAnimal = new Map<
    string,
    { animal: AttentionAnimal; reasons: AttentionReason[] }
  >();

  const ensure = (animal: AttentionAnimal) => {
    let entry = byAnimal.get(animal.id);
    if (!entry) {
      entry = { animal, reasons: [] };
      byAnimal.set(animal.id, entry);
    }
    return entry;
  };

  for (const row of input.tasksDue) {
    ensure(row.animal).reasons.push({
      kind: "TASK_DUE",
      taskId: row.taskId,
      title: row.title,
      dueDate: row.dueDate,
      priority: row.priority,
    });
  }
  for (const row of input.medicalDue) {
    ensure(row.animal).reasons.push({
      kind: "MEDICAL_DUE",
      entryId: row.entryId,
      itemName: row.itemName,
      entryKind: row.kind,
      dueDate: row.dueDate,
    });
  }
  for (const row of input.careUnplanned) {
    ensure(row.animal).reasons.push({
      kind: "CARE_UNPLANNED",
      episodeId: row.episodeId,
      episodeType: row.episodeType,
      startDate: row.startDate,
    });
  }
  for (const row of input.fostersOverdue) {
    ensure(row.animal).reasons.push({
      kind: "FOSTER_OVERDUE",
      placementId: row.placementId,
      expectedEndDate: row.expectedEndDate,
      fosterName: row.fosterName,
    });
  }

  const items = [...byAnimal.values()].map(({ animal, reasons }) => {
    const sortedReasons = [...reasons].sort(compareReasons);
    return {
      item: {
        animalId: animal.id,
        name: animal.name,
        species: animal.species,
        currentUnit: animal.currentUnit,
        reasons: sortedReasons,
      } satisfies AttentionQueueItem,
      // Sort keys derived from the (now ordered) reasons.
      tier: Math.min(...sortedReasons.map(reasonTier)),
      firstTask: sortedReasons.find((r) => r.kind === "TASK_DUE"),
      firstMedical: sortedReasons.find((r) => r.kind === "MEDICAL_DUE"),
      firstCare: sortedReasons.find((r) => r.kind === "CARE_UNPLANNED"),
      firstFoster: sortedReasons.find((r) => r.kind === "FOSTER_OVERDUE"),
    };
  });

  items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;

    if (a.tier === TIER.TASK_DUE && a.firstTask && b.firstTask) {
      const byDue = a.firstTask.dueDate.localeCompare(b.firstTask.dueDate);
      if (byDue !== 0) return byDue;
      const byPriority =
        PRIORITY_RANK[a.firstTask.priority] - PRIORITY_RANK[b.firstTask.priority];
      if (byPriority !== 0) return byPriority;
    }

    if (a.tier === TIER.MEDICAL_DUE && a.firstMedical && b.firstMedical) {
      const byDue = a.firstMedical.dueDate.localeCompare(b.firstMedical.dueDate);
      if (byDue !== 0) return byDue;
    }

    if (a.tier === TIER.CARE_UNPLANNED && a.firstCare && b.firstCare) {
      const byStart = a.firstCare.startDate.localeCompare(b.firstCare.startDate);
      if (byStart !== 0) return byStart;
    }

    if (a.tier === TIER.FOSTER_OVERDUE && a.firstFoster && b.firstFoster) {
      const byExpected = a.firstFoster.expectedEndDate.localeCompare(
        b.firstFoster.expectedEndDate,
      );
      if (byExpected !== 0) return byExpected;
    }

    // Total order — keeps the queue identical between identical inputs.
    return (
      a.item.name.localeCompare(b.item.name) ||
      a.item.animalId.localeCompare(b.item.animalId)
    );
  });

  return items.slice(0, ATTENTION_QUEUE_CAP).map(({ item }) => item);
}
