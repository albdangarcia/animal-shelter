// Pure merge/sort/dedupe logic for the attention queue — no Prisma imports, so
// it is trivially unit-testable (see `attention-queue.test.ts`). The query in
// `attention-queue.data.ts` stays dumb: it fetches the three candidate row sets
// and hands them here. This split is the shape recommended by
// `docs/specs/ai-chat/03-attention-queue.md` §Acceptance.

import type { AnimalHealthStatus, TaskPriority } from "@/prisma/generated/enums";

/**
 * Health statuses that count as "acute" for signal 2. Named constant, not
 * inline, so it can be tuned once there is output against real data.
 *
 * Deliberately excluded: `HEALTHY` (not a concern) and `AWAITING_SPAY_NEUTER`
 * (spay/neuter is routine and sticky — it would dominate the queue). Do not
 * read the omission as an oversight.
 */
export const ACUTE_HEALTH_STATUSES = [
  "AWAITING_TRIAGE",
  "AWAITING_VET_EXAM",
  "UNDER_VET_CARE",
  "HOSPITALISED",
  "AWAITING_OTHER_SURGERY",
  "RECOVERING_FROM_SURGERY",
] as const satisfies readonly AnimalHealthStatus[];

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

export type TaskDueRow = {
  animal: AttentionAnimal;
  taskId: string;
  title: string;
  dueDate: Date;
  priority: TaskPriority;
};

export type AcuteHealthRow = {
  animal: AttentionAnimal;
  healthStatus: AnimalHealthStatus;
};

export type FosterOverdueRow = {
  animal: AttentionAnimal;
  placementId: string;
  expectedEndDate: Date;
  fosterName: string; // person's display name only — no email/phone/address (D7)
};

// Structured reasons, not pre-formatted strings: a dashboard card and an AI
// tool want different wording from the same data.
export type AttentionReason =
  | {
      kind: "TASK_DUE";
      taskId: string;
      title: string;
      dueDate: Date;
      priority: TaskPriority;
    }
  | { kind: "UNTASKED_ACUTE_HEALTH"; healthStatus: AnimalHealthStatus }
  | {
      kind: "FOSTER_OVERDUE";
      placementId: string;
      expectedEndDate: Date;
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
const TIER = { TASK_DUE: 1, UNTASKED_ACUTE_HEALTH: 2, FOSTER_OVERDUE: 3 } as const;

function reasonTier(reason: AttentionReason): number {
  return TIER[reason.kind];
}

// Order reasons within a single animal: overdue tasks first (earliest due, then
// priority), then acute health, then foster. Deterministic.
function compareReasons(a: AttentionReason, b: AttentionReason): number {
  const byTier = reasonTier(a) - reasonTier(b);
  if (byTier !== 0) return byTier;
  if (a.kind === "TASK_DUE" && b.kind === "TASK_DUE") {
    const byDue = a.dueDate.getTime() - b.dueDate.getTime();
    if (byDue !== 0) return byDue;
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return a.taskId.localeCompare(b.taskId);
  }
  return 0;
}

/**
 * Merge the three signal row sets into one deduplicated, ordered, capped list.
 *
 * An animal appears **once**, carrying every reason it matched. Sort tiers
 * (`docs/specs/ai-chat/03-attention-queue.md` §Sort order):
 *   1. has an overdue/due-today task — by earliest due date, then priority
 *   2. untasked acute health
 *   3. overdue foster placement — by earliest expected end date
 * An animal in more than one tier sorts by its highest (lowest-numbered) tier.
 */
export function buildAttentionQueue(input: {
  tasksDue: TaskDueRow[];
  acuteHealth: AcuteHealthRow[];
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
  for (const row of input.acuteHealth) {
    ensure(row.animal).reasons.push({
      kind: "UNTASKED_ACUTE_HEALTH",
      healthStatus: row.healthStatus,
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
      firstFoster: sortedReasons.find((r) => r.kind === "FOSTER_OVERDUE"),
    };
  });

  items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;

    if (a.tier === TIER.TASK_DUE && a.firstTask && b.firstTask) {
      const byDue =
        a.firstTask.dueDate.getTime() - b.firstTask.dueDate.getTime();
      if (byDue !== 0) return byDue;
      const byPriority =
        PRIORITY_RANK[a.firstTask.priority] - PRIORITY_RANK[b.firstTask.priority];
      if (byPriority !== 0) return byPriority;
    }

    if (a.tier === TIER.FOSTER_OVERDUE && a.firstFoster && b.firstFoster) {
      const byExpected =
        a.firstFoster.expectedEndDate.getTime() -
        b.firstFoster.expectedEndDate.getTime();
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
