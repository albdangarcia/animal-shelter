export const AppPermissions = {
  // Dashboard Analytics Permissions
  ANIMAL_READ_ANALYTICS: "animal:read_analytics", // For pet analytics (e.g., on the main dashboard overview)
  
  // Intake Management
  // INTAKE_READ: "intake:read",
  INTAKE_MANAGE: "intake:create",

  // Outcome Management
  OUTCOMES_READ: "outcomes:read",
  OUTCOMES_MANAGE: "outcomes:manage",

  // Animal Info Permissions
  ANIMAL_INFO_READ: "animal_info:read",
  ANIMAL_INFO_MANAGE: "animal_info:manage",

  // Animal Photo Permissions
  ANIMAL_PHOTO_READ: "animal_photo:read",
  ANIMAL_PHOTO_MANAGE: "animal_photo:manage",

  // Animal Characteristics Permissions
  ANIMAL_CHARACTERISTICS_READ: "animal_characteristics:read",
  ANIMAL_CHARACTERISTICS_MANAGE: "animal_characteristics:manage",

  ANIMAL_ACTIVITY_READ: "animal_activity:read",
  ANIMAL_JOURNEY_READ: "animal_journey:read",

  // Animal Assessment Permissions
  ANIMAL_ASSESSMENT_READ: "animal_assessment:read",
  ANIMAL_ASSESSMENT_MANAGE: "animal_assessment:manage",

  // Animal Note Permissions
  ANIMAL_NOTE_READ: "animal_note:read",
  ANIMAL_NOTE_MANAGE: "animal_note:manage",

  // Animal Task Permissions
  ANIMAL_TASK_READ: "animal_task:read",
  ANIMAL_TASK_MANAGE: "animal_task:manage",

  // Partner Management
  PARTNERS_READ: "partners:read", // Directory listing + detail
  PARTNERS_MANAGE: "partners:manage",

  // Application Management (staff/admins manage; volunteers read-only)
  APPLICATIONS_READ: "applications:read", // List + detail of ALL user applications
  APPLICATIONS_MANAGE_STATUS: "applications:manage_status", // Approve/reject any application

  // My Application Management (users managing their own applications)
  MY_APPLICATIONS_READ: "my_applications:read",
  MY_APPLICATIONS_MANAGE: "my_applications:manage",

  // People Directory
  PERSONS_READ: "persons:read", // Listing + detail
  PERSONS_MANAGE: "persons:manage",

  MY_PROFILE_UPDATE: "my_profile:update", // Self-service profile feature

  // Role Management (admins only)
  MANAGE_ROLES: "user:manage_roles",
  
  // Catalog / System Configuration (admins only)
  MANAGE_CHARACTERISTICS_CATALOG: "characteristics_catalog:manage",
  MANAGE_ASSESSMENT_TEMPLATES: "assessment_templates:manage",
  MANAGE_ANIMAL_TAXONOMY: "animal_taxonomy:manage",
} as const;

export type AppPermission =
  (typeof AppPermissions)[keyof typeof AppPermissions];