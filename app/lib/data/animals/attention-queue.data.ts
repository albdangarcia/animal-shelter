import prisma from "@/app/lib/prisma";
import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";
import {
  getShelterNow,
  getShelterSettings,
} from "@/app/lib/data/shelter-settings.data";
import { RequireAllPermissions } from "../../auth/protected-actions";
import { buildAttentionQueue, type AttentionQueueItem } from "./attention-queue";
import { findAttentionSignals, type AttentionSignals } from "./attention-signals";
import { summarizeAttention, type AttentionGroup } from "./attention-summary";

export type { AttentionQueueItem, AttentionReason } from "./attention-queue";
export type { AttentionGroup } from "./attention-summary";

// "What needs attention today", as a work queue whose every item clears when
// someone acts on it. The five signals and what each one reads are in
// `attention-signals.ts`, an auth-free module the database tests drive. This
// file wraps them twice: the AI's capped per-animal queue, and the
// dashboard's uncapped counts per reason.
//
// Not the dashboard's "Under care" card (`fetchUnderCareSummary` in
// `analytics.data.ts`), which shows every open care episode whatever is
// planned for it.

// Both readers take "today" and the clock from one reading, so they agree on
// the day.
const readSignals = async (): Promise<AttentionSignals> => {
  const [{ today, clock }, { doseSlotEnds }] = await Promise.all([
    getShelterNow(),
    getShelterSettings(),
  ]);
  return findAttentionSignals(prisma, { today, clock, doseSlotEnds });
};

// Exported unwrapped for the AI tool layer: a tool's `execute` runs
// mid-stream where `RequirePermission`'s ambient session read is unreliable.
// `getAttentionQueue` calls `requireFor` for each of its permissions
// itself before calling this. The `RequirePermission`-wrapped `fetchAttentionQueue`
// export below stays for server components.
export const _fetchAttentionQueue = async (): Promise<AttentionQueueItem[]> => {
  try {
    return buildAttentionQueue(await readSignals());
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

const _fetchAttentionSummary = async (): Promise<AttentionGroup[]> => {
  try {
    return summarizeAttention(await readSignals());
  } catch (error) {
    console.error("Error fetching the attention summary.", error);
    throw new Error("Error fetching the attention summary.");
  }
};

/**
 * What the dashboard's "Needs attention today" needs: `ANIMAL_READ_ANALYTICS`
 * for the dashboard, and the queue's three reads, since the groups show the
 * same task titles, missed doses and scheduled care. The panel checks this
 * same list before it fetches, so a viewer short of one is left without the
 * panel rather than shown an error.
 */
export const ATTENTION_SUMMARY_PERMISSIONS = [
  AppPermissions.ANIMAL_READ_ANALYTICS,
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_TASK_READ,
  AppPermissions.MEDICAL_READ,
] as const satisfies readonly AppPermission[];

export const fetchAttentionSummary = RequireAllPermissions(
  ...ATTENTION_SUMMARY_PERMISSIONS,
)(_fetchAttentionSummary);
