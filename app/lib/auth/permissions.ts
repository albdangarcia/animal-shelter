export const Permissions = {
  // Pet Management
  INTAKE_CREATE: "intake:create",
  ANIMAL_UPDATE: "animal:update",
  ANIMAL_READ_ANALYTICS: "animal:read_analytics", // For pet analytics (e.g., on the main dashboard overview)
  ANIMAL_DELETE_IMAGE: "animal:delete_image",
  ANIMAL_READ_DETAIL: "animal:read_detail", // For viewing detailed pet information (including the edit form in read-only)
  ANIMAL_READ_LISTING: "animal:read_listing", // For viewing the pets list page (e.g., dashboard/pets)

  ANIMAL_ACTIVITY_READ: "animal_activity:read",

  // Animal Assessment Permissions
  ANIMAL_ASSESSMENT_CREATE: "animal_assessment:create",
  ANIMAL_ASSESSMENT_UPDATE: "animal_assessment:update",
  ANIMAL_ASSESSMENT_READ_DETAIL: "animal_assessment:read_detail",
  ANIMAL_ASSESSMENT_DELETE: "animal_assessment:delete",
  ANIMAL_ASSESSMENT_READ_LISTING: "animal_assessment:read_listing",

  // Animal Note Permissions
  ANIMAL_NOTE_CREATE: "animal_note:create",
  ANIMAL_NOTE_UPDATE: "animal_note:update",
  ANIMAL_NOTE_DELETE: "animal_note:delete",
  ANIMAL_NOTE_READ_LISTING: "animal_note:read_listing",

  ANIMAL_TASK_CREATE: "animal_task:create",
  ANIMAL_TASK_UPDATE: "animal_task:update",
  ANIMAL_TASK_DELETE: "animal_task:delete",
  ANIMAL_TASK_READ_LISTING: "animal_task:read_listing",

  ANIMAL_CHARACTERISTICS_UPDATE: "animal:characteristics_update",

  ANIMAL_JOURNEY_READ: "animal_journey:read",

  PARTNER_READ: "partner:read_analytics",

  // Application Management (for staff/admins, and volunteers for read-only)
  APPLICATIONS_READ_LISTING: "applications:read_listing", // View list of ALL user applications
  APPLICATIONS_READ_DETAIL: "applications:read_detail",
  APPLICATIONS_MANAGE_STATUS: "applications:manage_status", // Update status (approve/reject) of any application

  OUTCOMES_READ_LISTING: "outcome:read_listing",
  OUTCOMES_READ_DETAIL: "outcome:read_detail",
  OUTCOMES_MANAGE: "outcome:manage",

  // My Application Management (for users managing their own applications)
  MY_APPLICATIONS_READ: "my_applications:read", // View list of own applications
  MY_APPLICATIONS_CREATE: "my_applications:create", // Create an application
  MY_APPLICATIONS_UPDATE: "my_applications:update", // Edit own application

  PERSONS_READ_LISTING: "persons:read_listing",
  PERSONS_READ_DETAIL: "persons:read_detail",
  PERSONS_MANAGE: "persons:manage",

  MY_PROFILE_UPDATE: "my_profile:update", // Self-service profile feature

  // Role Management (admins only)
  MANAGE_ROLES: "user:manage_roles",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];