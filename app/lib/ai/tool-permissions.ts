/**
 * What each assistant tool requires, and which tools an actor may use.
 *
 * Declared once, here, with no data-layer imports: `registry.ts` filters the
 * tool set on these constants and each tool's `execute` enforces its own
 * again with `requireFor`, so the two cannot drift. Kept apart from the tools
 * themselves because most of them import Prisma, and the filter has to be
 * unit-testable without a database.
 */
import type { Actor } from "@/app/lib/auth/actor";
import { can } from "@/app/lib/auth/can";
import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";
import type { AiToolName } from "./tool-names";

export const FIND_ANIMALS_PERMISSIONS = [AppPermissions.ANIMAL_INFO_READ];

export const GET_ANIMAL_SUMMARY_PERMISSIONS = [AppPermissions.ANIMAL_INFO_READ];

// All four reads, as the readiness board and panel require: outstanding
// items come from assessments, characteristic claims and the medical record
// as well as the animal record.
export const GET_ANIMAL_READINESS_PERMISSIONS = [
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
  AppPermissions.MEDICAL_READ,
];

// All three reads: the queue puts task detail, missed medication doses and
// scheduled medical care next to animal identity.
export const GET_ATTENTION_QUEUE_PERMISSIONS = [
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_TASK_READ,
  AppPermissions.MEDICAL_READ,
];

// Staff and admin only; a volunteer's registry never contains this tool.
export const SET_TASK_STATUS_PERMISSIONS = [AppPermissions.ANIMAL_TASK_MANAGE];

// Anyone who may use the chat. Which guides come back is decided inside each
// tool, from the guides' own `permissions`, so a reader who can see no guide
// gets an empty result rather than a missing tool.
export const GUIDE_TOOL_PERMISSIONS = [AppPermissions.AI_CHAT_USE];

export const TOOL_PERMISSIONS: Record<AiToolName, readonly AppPermission[]> = {
  findAnimals: FIND_ANIMALS_PERMISSIONS,
  getAnimalReadiness: GET_ANIMAL_READINESS_PERMISSIONS,
  getAnimalSummary: GET_ANIMAL_SUMMARY_PERMISSIONS,
  getAttentionQueue: GET_ATTENTION_QUEUE_PERMISSIONS,
  searchGuides: GUIDE_TOOL_PERMISSIONS,
  readGuide: GUIDE_TOOL_PERMISSIONS,
  setTaskStatus: SET_TASK_STATUS_PERMISSIONS,
};

const TOOL_NAMES = Object.keys(TOOL_PERMISSIONS) as AiToolName[];

/** The tool names an actor's role can use — filtered by `can`. */
export function toolNamesForActor(actor: Actor): AiToolName[] {
  return TOOL_NAMES.filter((name) =>
    TOOL_PERMISSIONS[name].every((permission) => can(actor.role, permission)),
  );
}
