// Pure merge/sort/dedupe logic for the attention queue — no Prisma imports, so
// it is trivially unit-testable (see `attention-queue.test.ts`). The query in
// `attention-queue.data.ts` stays dumb: it fetches the five candidate row sets
// and hands them here. This split is the shape recommended by
// `docs/specs/ai-chat/03-attention-queue.md` §Acceptance.

import type {
  CareEpisodeType,
  DoseSlot,
  MedicalEntryKind,
  TaskPriority,
} from "@/prisma/generated/enums";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";
import { DOSE_SLOT_ORDER } from "@/app/lib/constants/medical";

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
 * medical ones in `app/lib/data/medical-due.ts` and
 * `app/lib/data/medication-doses.ts`.
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
      kind: "DOSE_MISSED";
      /** How many slots were missed yesterday and today. */
      count: number;
      earliestSlotDate: CalendarDay;
      earliestSlot: DoseSlot;
      /** The medications missed, by name. */
      medications: string[];
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
export const TIER = {
  TASK_DUE: 1,
  DOSE_MISSED: 2,
  MEDICAL_DUE: 3,
  CARE_UNPLANNED: 4,
  FOSTER_OVERDUE: 5,
} as const;

/** A missed slot's place in time: its day, then AM before Midday before PM. */
const compareSlots = (
  a: { slotDate: CalendarDay; slot: DoseSlot },
  b: { slotDate: CalendarDay; slot: DoseSlot },
): number =>
  a.slotDate.localeCompare(b.slotDate) ||
  DOSE_SLOT_ORDER.indexOf(a.slot) - DOSE_SLOT_ORDER.indexOf(b.slot);

const earliestMissed = (reason: Extract<AttentionReason, { kind: "DOSE_MISSED" }>) => ({
  slotDate: reason.earliestSlotDate,
  slot: reason.earliestSlot,
});

function reasonTier(reason: AttentionReason): number {
  return TIER[reason.kind];
}

/**
 * The order of two reasons of the same kind, by that kind's own keys: tasks
 * by due date, then priority; missed doses by the earliest missed slot;
 * medical care by due date; care with nothing planned by the episode's start;
 * fosters by the expected end. 0 when the keys tie, or the kinds differ.
 *
 * The one place these keys live: the queue orders animals within a tier by
 * them, and the dashboard's summary (`attention-summary.ts`) orders each
 * group by them, so the two list animals in the same order.
 */
export function compareTierKeys(a: AttentionReason, b: AttentionReason): number {
  // `yyyy-MM-dd` days sort chronologically as plain strings.
  if (a.kind === "TASK_DUE" && b.kind === "TASK_DUE") {
    return (
      a.dueDate.localeCompare(b.dueDate) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    );
  }
  if (a.kind === "DOSE_MISSED" && b.kind === "DOSE_MISSED") {
    return compareSlots(earliestMissed(a), earliestMissed(b));
  }
  if (a.kind === "MEDICAL_DUE" && b.kind === "MEDICAL_DUE") {
    return a.dueDate.localeCompare(b.dueDate);
  }
  if (a.kind === "CARE_UNPLANNED" && b.kind === "CARE_UNPLANNED") {
    return a.startDate.localeCompare(b.startDate);
  }
  if (a.kind === "FOSTER_OVERDUE" && b.kind === "FOSTER_OVERDUE") {
    return a.expectedEndDate.localeCompare(b.expectedEndDate);
  }
  return 0;
}

// Order reasons within a single animal: by tier, then by the tier's keys
// (`compareTierKeys`), then by the task's or entry's id, so two tasks due the
// same day at the same priority still have an order. Deterministic.
export function compareReasons(a: AttentionReason, b: AttentionReason): number {
  const byTier = reasonTier(a) - reasonTier(b);
  if (byTier !== 0) return byTier;
  const byKeys = compareTierKeys(a, b);
  if (byKeys !== 0) return byKeys;
  if (a.kind === "TASK_DUE" && b.kind === "TASK_DUE") {
    return a.taskId.localeCompare(b.taskId);
  }
  if (a.kind === "MEDICAL_DUE" && b.kind === "MEDICAL_DUE") {
    return a.entryId.localeCompare(b.entryId);
  }
  return 0;
}

/** The five signals' row sets, as `findAttentionSignals`
 * (`attention-signals.ts`) reads them. Uncapped. */
export type AttentionSignals = {
  tasksDue: TaskDueRow[];
  dosesMissed: MissedDoseRow[];
  medicalDue: MedicalDueRow[];
  careUnplanned: CareUnplannedRow[];
  fostersOverdue: FosterOverdueRow[];
};

/** Every signal row as a reason on its animal, in signal order (tasks, missed
 * doses, medical care, care with nothing planned, fosters). Shared by the
 * queue and the dashboard's summary (`attention-summary.ts`), so the two word
 * nothing differently. */
export function attentionReasons(
  input: AttentionSignals,
): { animal: AttentionAnimal; reason: AttentionReason }[] {
  return [
    ...input.tasksDue.map((row) => ({
      animal: row.animal,
      reason: {
        kind: "TASK_DUE",
        taskId: row.taskId,
        title: row.title,
        dueDate: row.dueDate,
        priority: row.priority,
      } satisfies AttentionReason,
    })),
    ...input.dosesMissed.map((row) => ({
      animal: row.animal,
      reason: {
        kind: "DOSE_MISSED",
        count: row.count,
        earliestSlotDate: row.earliest.slotDate,
        earliestSlot: row.earliest.slot,
        medications: row.medications,
      } satisfies AttentionReason,
    })),
    ...input.medicalDue.map((row) => ({
      animal: row.animal,
      reason: {
        kind: "MEDICAL_DUE",
        entryId: row.entryId,
        itemName: row.itemName,
        entryKind: row.kind,
        dueDate: row.dueDate,
      } satisfies AttentionReason,
    })),
    ...input.careUnplanned.map((row) => ({
      animal: row.animal,
      reason: {
        kind: "CARE_UNPLANNED",
        episodeId: row.episodeId,
        episodeType: row.episodeType,
        startDate: row.startDate,
      } satisfies AttentionReason,
    })),
    ...input.fostersOverdue.map((row) => ({
      animal: row.animal,
      reason: {
        kind: "FOSTER_OVERDUE",
        placementId: row.placementId,
        expectedEndDate: row.expectedEndDate,
        fosterName: row.fosterName,
      } satisfies AttentionReason,
    })),
  ];
}

/**
 * Merge the five signal row sets into one deduplicated, ordered, capped list.
 *
 * An animal appears **once**, carrying every reason it matched. Sort tiers
 * (`docs/specs/ai-chat/03-attention-queue.md` §Sort order, with missed doses
 * and scheduled medical care added after tasks):
 *   1. has an overdue/due-today task — by earliest due date, then priority
 *   2. missed a medication dose yesterday or today — by the earliest missed
 *      slot. Before scheduled care: a missed dose can still be given today,
 *      and a course goes wrong one missed dose at a time.
 *   3. has scheduled medical care overdue or due today — by earliest due date
 *   4. is under an open care episode with nothing planned (no open task, no
 *      scheduled care, no medication order running) — by the episode's start
 *   5. overdue foster placement — by earliest expected end date
 * An animal in more than one tier sorts by its highest (lowest-numbered) tier.
 */
export function buildAttentionQueue(
  input: AttentionSignals,
): AttentionQueueItem[] {
  const byAnimal = new Map<
    string,
    { animal: AttentionAnimal; reasons: AttentionReason[] }
  >();

  for (const { animal, reason } of attentionReasons(input)) {
    let entry = byAnimal.get(animal.id);
    if (!entry) {
      entry = { animal, reasons: [] };
      byAnimal.set(animal.id, entry);
    }
    entry.reasons.push(reason);
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
      // Reasons are sorted by tier first, so the first is the animal's tier
      // and the reason it is ordered by within that tier.
      first: sortedReasons[0],
    };
  });

  items.sort(
    (a, b) =>
      reasonTier(a.first) - reasonTier(b.first) ||
      compareTierKeys(a.first, b.first) ||
      // Total order — keeps the queue identical between identical inputs.
      a.item.name.localeCompare(b.item.name) ||
      a.item.animalId.localeCompare(b.item.animalId),
  );

  return items.slice(0, ATTENTION_QUEUE_CAP).map(({ item }) => item);
}
