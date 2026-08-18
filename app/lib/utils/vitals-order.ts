import type { Prisma } from "@/prisma/generated/client";

// Same-day entries collide: the date picker only captures calendar days, so two
// entries backdated to the same date get an identical recordedAt, and a bare
// `orderBy: { recordedAt: "desc" }` becomes nondeterministic — Postgres makes no
// promise about tie order, and it can change across queries. Break ties by
// createdAt (most recently entered wins among same-day entries — the sensible
// reading of "latest"), then id as a final deterministic guarantee.
//
// Every query anywhere in the app that resolves "the latest vitals entry" (or
// "the last N") MUST use this exact tiebreaker chain — recomputeCurrentWeight
// and previousWeighIn in animal-vitals.actions.ts, the vitals list's default/
// recordedAt sort in animal-vitals.data.ts, and the section-cards trend / edit
// form's last-weigh-in date in animal.data.ts — or the cached weight, the
// overview card, and what the list displays as newest can all disagree.
export function latestVitalsEntryOrder(
  direction: "asc" | "desc" = "desc",
): Prisma.VitalsLogOrderByWithRelationInput[] {
  return [
    { recordedAt: direction },
    { createdAt: direction },
    { id: direction },
  ];
}

// The common case — "most recent first" — for call sites that don't need the
// direction to vary (i.e. everything except the vitals list's user-selectable
// sort order).
export const LATEST_ENTRY_ORDER = latestVitalsEntryOrder("desc");
