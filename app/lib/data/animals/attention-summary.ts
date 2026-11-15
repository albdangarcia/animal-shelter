// The dashboard's "Needs attention today": the attention queue's signals as
// one group per reason, with an uncapped count and the first few animals.
// Pure, so it is unit-tested (`attention-summary.test.ts`); the rows come from
// `findAttentionSignals`, the same read the AI's capped queue merges, so the
// two never disagree on what is due.
//
// Not read from `buildAttentionQueue`: that result stops at
// `ATTENTION_QUEUE_CAP` animals, so a count taken from it would be wrong
// whenever more animals need attention.

import {
  attentionReasons,
  compareReasons,
  compareTierKeys,
  TIER,
  type AttentionAnimal,
  type AttentionReason,
  type AttentionSignals,
} from "./attention-queue";

/** How many animals each group shows under its count. */
export const ATTENTION_PREVIEW_SIZE = 3;

export type AttentionKind = AttentionReason["kind"];

export type AttentionGroup = {
  kind: AttentionKind;
  /**
   * Uncapped, in the unit the group's label names: tasks, animals that missed
   * a dose, care items, animals under care with nothing planned, foster
   * placements.
   */
  count: number;
  /** The first animals in the group's order, each once, with its first reason
   *  of the group's kind. At most `ATTENTION_PREVIEW_SIZE`. */
  first: { animal: AttentionAnimal; reason: AttentionReason }[];
};

// Missed doses come one row per animal, and an animal has at most one open
// care episode, so for those two kinds a row is an animal: the count says
// "animals". The other kinds count their rows: one animal can have three
// tasks due, and each needs doing.
const COUNTS_ANIMALS: Record<AttentionKind, boolean> = {
  TASK_DUE: false,
  DOSE_MISSED: true,
  MEDICAL_DUE: false,
  CARE_UNPLANNED: true,
  FOSTER_OVERDUE: false,
};

// Within one kind, the queue's own order for that tier: the kind's keys
// (`compareTierKeys`), then the animal's name and id, as the queue breaks a
// tie. Last, `compareReasons` orders one animal's rows by the task's or
// entry's id, so its first row is the one the queue shows first.
const compareInGroup = (
  a: { animal: AttentionAnimal; reason: AttentionReason },
  b: { animal: AttentionAnimal; reason: AttentionReason },
): number =>
  compareTierKeys(a.reason, b.reason) ||
  a.animal.name.localeCompare(b.animal.name) ||
  a.animal.id.localeCompare(b.animal.id) ||
  compareReasons(a.reason, b.reason);

/**
 * One group per reason kind that has any rows, in the queue's tier order:
 * tasks due, missed doses, medical care due, care with nothing planned,
 * fosters overdue. A kind with no rows has no group.
 */
export function summarizeAttention(signals: AttentionSignals): AttentionGroup[] {
  const byKind = new Map<
    AttentionKind,
    { animal: AttentionAnimal; reason: AttentionReason }[]
  >();
  for (const row of attentionReasons(signals)) {
    const rows = byKind.get(row.reason.kind) ?? [];
    rows.push(row);
    byKind.set(row.reason.kind, rows);
  }

  const kinds = (Object.keys(TIER) as AttentionKind[]).sort(
    (a, b) => TIER[a] - TIER[b],
  );

  return kinds.flatMap((kind): AttentionGroup[] => {
    const rows = byKind.get(kind);
    if (!rows || rows.length === 0) return [];
    const sorted = [...rows].sort(compareInGroup);

    const first: AttentionGroup["first"] = [];
    const seen = new Set<string>();
    for (const row of sorted) {
      if (seen.has(row.animal.id)) continue;
      seen.add(row.animal.id);
      first.push(row);
      if (first.length === ATTENTION_PREVIEW_SIZE) break;
    }

    const count = COUNTS_ANIMALS[kind]
      ? new Set(rows.map((row) => row.animal.id)).size
      : rows.length;

    return [{ kind, count, first }];
  });
}
