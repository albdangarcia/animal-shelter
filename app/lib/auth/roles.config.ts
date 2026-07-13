import { Role } from "@prisma/client";
import { AppPermission, AppPermissions } from "./permissions";

// Permissions for the base user role
const userPermissions: readonly AppPermission[] = [
  AppPermissions.MY_APPLICATIONS_READ,
  AppPermissions.MY_APPLICATIONS_MANAGE,
  AppPermissions.MY_PROFILE_UPDATE,
  AppPermissions.MY_FOSTER_APPLICATION_MANAGE,
  AppPermissions.MY_FOSTER_ANIMALS_READ,
] as const;

// Volunteers inherit user permissions + read-only access to operational data
const volunteerPermissions: readonly AppPermission[] = [
  ...userPermissions,
  AppPermissions.ANIMAL_READ_ANALYTICS,
  AppPermissions.ANIMAL_INFO_READ,
  AppPermissions.ANIMAL_ACTIVITY_READ,
  AppPermissions.ANIMAL_JOURNEY_READ,
  AppPermissions.ANIMAL_ASSESSMENT_READ,
  AppPermissions.ANIMAL_NOTE_READ,
  AppPermissions.ANIMAL_TASK_READ,
  AppPermissions.ANIMAL_CHARACTERISTICS_READ,
  AppPermissions.ANIMAL_PHOTO_READ,
  AppPermissions.APPLICATIONS_READ,
  AppPermissions.OUTCOMES_READ,
  AppPermissions.REPORTS_READ,
  AppPermissions.PARTNERS_READ,
  AppPermissions.PERSONS_READ,
  AppPermissions.FOSTERS_READ,
] as const;

// Staff inherit volunteer permissions + management of operational data
const staffPermissions: readonly AppPermission[] = [
  ...volunteerPermissions,
  AppPermissions.INTAKE_MANAGE,
  AppPermissions.ANIMAL_INFO_MANAGE,
  AppPermissions.ANIMAL_PHOTO_MANAGE,
  AppPermissions.ANIMAL_CHARACTERISTICS_MANAGE,
  AppPermissions.ANIMAL_NOTE_MANAGE,
  AppPermissions.ANIMAL_TASK_MANAGE,
  AppPermissions.ANIMAL_ASSESSMENT_MANAGE,
  AppPermissions.APPLICATIONS_MANAGE_STATUS,
  AppPermissions.OUTCOMES_MANAGE,
  AppPermissions.PERSONS_MANAGE,
  AppPermissions.PARTNERS_MANAGE,
  AppPermissions.FOSTERS_MANAGE,
] as const;

// Admin inherits all staff permissions
const adminPermissions: readonly AppPermission[] = [
  ...staffPermissions,
  AppPermissions.MANAGE_ROLES,
  AppPermissions.MANAGE_CHARACTERISTICS_CATALOG,
  AppPermissions.MANAGE_ASSESSMENT_TEMPLATES,
  AppPermissions.MANAGE_ANIMAL_TAXONOMY,
  AppPermissions.MANAGE_LOCATIONS,
] as const;

export const rolePermissions: Record<Role, readonly AppPermission[]> = {
  [Role.USER]: userPermissions,
  [Role.VOLUNTEER]: volunteerPermissions,
  [Role.STAFF]: staffPermissions,
  [Role.ADMIN]: adminPermissions,
};