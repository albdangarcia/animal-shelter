import { Role } from "@prisma/client";
import { Permission, Permissions } from "./permissions";

// Permissions for the base user role
const userPermissions: readonly Permission[]  = [
  Permissions.MY_APPLICATIONS_READ, // Any registered user can see their applications list
  Permissions.MY_APPLICATIONS_UPDATE, // Any registered user can edit their own applications
  Permissions.MY_APPLICATIONS_CREATE, // Any registered user can create new applications
  Permissions.MY_PROFILE_UPDATE,
] as const;

// Permissions for the volunteer role
const volunteerPermissions: readonly Permission[]  = [
  ...userPermissions, // Volunteers inherit base user permissions
  Permissions.PARTNER_READ, // Volunteers can read partners
  Permissions.ANIMAL_READ_ANALYTICS, // Volunteers can view pet analytics
  Permissions.ANIMAL_READ_LISTING, // Volunteers can view the list of pets
  Permissions.ANIMAL_READ_DETAIL, // Volunteers can view detailed pet information (read-only)
  Permissions.APPLICATIONS_READ_LISTING, // Volunteers can view the list of all user applications (read-only)
  Permissions.APPLICATIONS_READ_DETAIL, // Volunteers can view detailed application information (read-only)
  Permissions.ANIMAL_ACTIVITY_READ,
  Permissions.ANIMAL_JOURNEY_READ,
  Permissions.ANIMAL_ASSESSMENT_READ_DETAIL,
  Permissions.ANIMAL_NOTE_READ_LISTING,
  Permissions.ANIMAL_TASK_READ_LISTING,
  Permissions.ANIMAL_ASSESSMENT_READ_LISTING,
  Permissions.OUTCOMES_READ_LISTING,
  Permissions.OUTCOMES_READ_DETAIL,
] as const;

// Staff inherits all USER permissions and gets additional ones
const staffPermissions: readonly Permission[]  = [
  ...volunteerPermissions,
  Permissions.INTAKE_CREATE,
  Permissions.ANIMAL_UPDATE,
  Permissions.ANIMAL_DELETE_IMAGE,
  Permissions.APPLICATIONS_MANAGE_STATUS, // Staff can manage the status of applications

  Permissions.ANIMAL_CHARACTERISTICS_UPDATE,

  Permissions.ANIMAL_NOTE_CREATE,
  Permissions.ANIMAL_NOTE_UPDATE,
  Permissions.ANIMAL_NOTE_DELETE,

  Permissions.ANIMAL_TASK_CREATE,
  Permissions.ANIMAL_TASK_UPDATE,
  Permissions.ANIMAL_TASK_DELETE,

  Permissions.ANIMAL_ASSESSMENT_CREATE,
  Permissions.ANIMAL_ASSESSMENT_READ_DETAIL,
  Permissions.ANIMAL_ASSESSMENT_UPDATE,
  Permissions.ANIMAL_ASSESSMENT_DELETE,

  Permissions.OUTCOMES_MANAGE,

  Permissions.PERSONS_READ_LISTING,
  Permissions.PERSONS_READ_DETAIL,
  Permissions.PERSONS_MANAGE,
] as const;

// Admin inherits all STAFF permissions
const adminPermissions: readonly Permission[]  = [
  ...staffPermissions,
  Permissions.MANAGE_ROLES,
] as const;

// Final mapping object
export const rolePermissions: Record<Role, readonly Permission[]> = {
  [Role.USER]: userPermissions,
  [Role.VOLUNTEER]: volunteerPermissions,
  [Role.STAFF]: staffPermissions,
  [Role.ADMIN]: adminPermissions,
};
