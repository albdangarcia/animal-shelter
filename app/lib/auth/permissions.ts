export const AppPermissions = {
  // Dashboard Analytics Permissions
  ANIMAL_READ_ANALYTICS: "animal:read_analytics", // For pet analytics (e.g., on the main dashboard overview)

  // Reporting (historical/compliance statistics)
  // reports are the historical/compliance surface over a user-selected range.
  REPORTS_READ: "reports:read",

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

  // AI Activity Log (oversight surface for AI-initiated writes)
  // Gates the /dashboard/settings/ai-activity page and the undo path there.
  // Granted to STAFF and ADMIN only — volunteers hold no write tools, so
  // nothing of theirs is ever recorded in AiActionLog.
  AI_ACTIVITY_READ: "ai_activity:read",

  // Animal Assessment Permissions
  ANIMAL_ASSESSMENT_READ: "animal_assessment:read",
  ANIMAL_ASSESSMENT_MANAGE: "animal_assessment:manage",

  // Animal Vitals Permissions
  ANIMAL_VITALS_READ: "animal_vitals:read",
  ANIMAL_VITALS_MANAGE: "animal_vitals:manage",

  // Animal Note Permissions
  ANIMAL_NOTE_READ: "animal_note:read",
  ANIMAL_NOTE_MANAGE: "animal_note:manage",

  // Animal Task Permissions
  ANIMAL_TASK_READ: "animal_task:read",
  ANIMAL_TASK_MANAGE: "animal_task:manage",

  // AI Staff Chat
  // Gates the sidebar entry and the /dashboard/ai-chat route only. Which tools
  // the assistant may call is decided per-request from the caller's other
  // permissions (see app/lib/ai/registry.ts) — this one does not imply any of
  // them. Gating chat on ANIMAL_INFO_READ would produce the same role matrix
  // today by coincidence; a distinct entitlement lets chat access diverge later
  // without a change of intent.
  AI_CHAT_USE: "ai_chat:use",

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

  // Foster Management (staff/admins manage; volunteers read-only)
  FOSTERS_READ: "fosters:read", // Roster + foster applications + placements, read-only
  FOSTERS_MANAGE: "fosters:manage", // Review applications, manage profiles, create/end placements

  // My Foster Management (users managing their own foster application/animals)
  MY_FOSTER_APPLICATION_MANAGE: "my_foster_application:manage",
  MY_FOSTER_ANIMALS_READ: "my_foster_animals:read",

  MY_PROFILE_UPDATE: "my_profile:update", // Self-service profile feature

  // Role Management (admins only)
  MANAGE_ROLES: "user:manage_roles",
  
  // Catalog / System Configuration (admins only)
  MANAGE_CHARACTERISTICS_CATALOG: "characteristics_catalog:manage",
  MANAGE_ASSESSMENT_TEMPLATES: "assessment_templates:manage",
  MANAGE_ANIMAL_TAXONOMY: "animal_taxonomy:manage",
  MANAGE_LOCATIONS: "locations:manage",
} as const;

export type AppPermission =
  (typeof AppPermissions)[keyof typeof AppPermissions];