// The permissions readiness is read with. No auth and no next/* imports, so
// the page, the sidebar, the data layer and the AI tools can all share it.
import { AppPermissions, type AppPermission } from "@/app/lib/auth/permissions";

/**
 * Every read readiness is judged from: blockers come from the animal record,
 * assessments, characteristic claims and the medical record. Every reader of
 * readiness requires all four (the board and its sidebar entry, the Activity
 * panel, the dashboard card and the AI tools), so a viewer missing one sees
 * "Access Denied" rather than a failed fetch.
 */
export const READINESS_READ_PERMISSIONS = [
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
  AppPermissions.MEDICAL_READ,
] as const satisfies readonly [AppPermission, ...AppPermission[]];
