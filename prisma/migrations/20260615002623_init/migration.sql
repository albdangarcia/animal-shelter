-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF', 'USER', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "CharacteristicCategory" AS ENUM ('BEHAVIOR', 'MEDICAL', 'ENVIRONMENT', 'ADMINISTRATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicalRecordType" AS ENUM ('VACCINATION', 'PROCEDURE', 'MEDICATION', 'ALLERGY', 'CHECKUP', 'NOTE');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('INDIVIDUAL', 'AGENCY');

-- CreateEnum
CREATE TYPE "OutcomeType" AS ENUM ('ADOPTION', 'TRANSFER_OUT', 'RETURN_TO_OWNER', 'DECEASED', 'EUTHANIZED', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('MEDICAL', 'BEHAVIORAL', 'ADMINISTRATIVE', 'CLEANING', 'FEEDING');

-- CreateEnum
CREATE TYPE "AnimalActivityType" AS ENUM ('FIELD_UPDATE', 'NOTE_ADDED', 'PHOTO_UPLOADED', 'MEDICAL_RECORD_ADDED', 'ASSESSMENT_COMPLETED', 'TASK_CREATED', 'TASK_STATUS_CHANGED', 'STATUS_CHANGE', 'INTAKE_PROCESSED', 'OUTCOME_PROCESSED', 'CREATED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'CANCELED', 'ON_HOLD', 'DELETED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('BEHAVIORAL', 'MEDICAL', 'FEEDING', 'GENERAL', 'ADOPTION_UPDATE', 'FOSTER_UPDATE');

-- CreateEnum
CREATE TYPE "AnimalSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'XLARGE');

-- CreateEnum
CREATE TYPE "IntakeType" AS ENUM ('OWNER_SURRENDER', 'STRAY', 'BORN_IN_CARE', 'TRANSFER_IN', 'SEIZE', 'SERVICE_IN', 'ACO_IMPOUND');

-- CreateEnum
CREATE TYPE "AnimalLegalStatus" AS ENUM ('NONE', 'STRAY_HOLD', 'BITE_QUARANTINE', 'COURT_HOLD', 'POLICE_HOLD', 'PROTECTIVE_CUSTODY');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnimalHealthStatus" AS ENUM ('HEALTHY', 'AWAITING_VET_EXAM', 'AWAITING_TRIAGE', 'UNDER_VET_CARE', 'HOSPITALISED', 'AWAITING_SPAY_NEUTER', 'AWAITING_OTHER_SURGERY', 'RECOVERING_FROM_SURGERY');

-- CreateEnum
CREATE TYPE "AnimalListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PENDING_ADOPTION', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'REVIEWING', 'WAITLISTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ADOPTED');

-- CreateEnum
CREATE TYPE "AnimalArchiveReason" AS ENUM ('ADOPTED_INTERNAL', 'ADOPTED_EXTERNAL', 'TRANSFERRED', 'RETURNED_TO_OWNER', 'DECEASED', 'EUTHANIZED', 'OTHER');

-- CreateEnum
CREATE TYPE "LivingSituation" AS ENUM ('OWN_HOME', 'RENT_APARTMENT', 'RENT_HOUSE', 'LIVE_WITH_FAMILY', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('SHELTER', 'RESCUE_GROUP', 'VET_CLINIC', 'GOVERNMENT_AGENCY');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('INTAKE_MEDICAL', 'INTAKE_BEHAVIORAL', 'DAILY_MONITORING', 'PLAYGROUP_EVALUATION', 'CAT_TEST', 'DOG_TEST', 'HANDLING_SENSITIVITY', 'LEASH_MANNER', 'QUARANTINE_CHECK', 'POST_ADOPTION_FOLLOWUP', 'OTHER');

-- CreateEnum
CREATE TYPE "AssessmentOutcome" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'NEEDS_ATTENTION', 'MONITOR', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'CHECKBOX', 'RADIO', 'DATE');

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intakes" (
    "id" TEXT NOT NULL,
    "intakeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "IntakeType" NOT NULL,
    "animalId" TEXT NOT NULL,
    "surrenderingPersonId" TEXT,
    "dateLost" TIMESTAMP(3),
    "foundAddress" TEXT,
    "foundCity" TEXT,
    "foundState" TEXT,
    "foundZipCode" TEXT,
    "foundByPersonId" TEXT,
    "sourcePartnerId" TEXT,
    "staffMemberId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcomes" (
    "id" TEXT NOT NULL,
    "outcomeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "OutcomeType" NOT NULL,
    "animalId" TEXT NOT NULL,
    "adoptionApplicationId" TEXT,
    "ownerId" TEXT,
    "destinationPartnerId" TEXT,
    "staffMemberId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3) NOT NULL,
    "sex" "Sex" NOT NULL,
    "size" "AnimalSize",
    "weight_kg" DOUBLE PRECISION,
    "height_cm" DOUBLE PRECISION,
    "city" TEXT,
    "state" TEXT,
    "description" TEXT,
    "listingStatus" "AnimalListingStatus" NOT NULL DEFAULT 'DRAFT',
    "microchipNumber" TEXT,
    "archiveReason" "AnimalArchiveReason",
    "species_id" TEXT NOT NULL,
    "healthStatus" "AnimalHealthStatus",
    "legalStatus" "AnimalLegalStatus" DEFAULT 'NONE',
    "isSpayedNeutered" BOOLEAN NOT NULL DEFAULT false,
    "foster_profile_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "species" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characteristics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "CharacteristicCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "characteristics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "category" "NoteCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "author_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "category" "TaskCategory" NOT NULL,
    "due_date" TIMESTAMP(3),
    "animal_id" TEXT NOT NULL,
    "assignee_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" TEXT NOT NULL,
    "type" "MedicalRecordType" NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "date_of_record" TIMESTAMP(3) NOT NULL,
    "document_url" TEXT,
    "animal_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foster_profiles" (
    "id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "internalNotes" TEXT,
    "person_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foster_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_profiles" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "living_situation" "LivingSituation" NOT NULL,
    "has_yard" BOOLEAN,
    "landlord_permission" BOOLEAN,
    "household_size" INTEGER NOT NULL,
    "has_children" BOOLEAN,
    "children_ages" INTEGER[],
    "other_animals_description" TEXT,
    "animal_experience" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adoption_applications" (
    "id" TEXT NOT NULL,
    "applicant_name" TEXT NOT NULL,
    "applicant_email" TEXT NOT NULL,
    "applicant_phone" TEXT NOT NULL,
    "applicant_address_line1" TEXT NOT NULL,
    "applicant_address_line2" TEXT,
    "applicant_city" TEXT NOT NULL,
    "applicant_state" TEXT NOT NULL,
    "applicant_zip_code" TEXT NOT NULL,
    "living_situation" "LivingSituation" NOT NULL,
    "has_yard" BOOLEAN,
    "landlord_permission" BOOLEAN,
    "household_size" INTEGER NOT NULL,
    "has_children" BOOLEAN,
    "children_ages" INTEGER[],
    "other_animals_description" TEXT,
    "animal_experience" TEXT,
    "reason_for_adoption" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "internalNotes" TEXT,
    "user_id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adoption_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL,
    "statusChangeReason" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" TEXT,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_images" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PersonType" NOT NULL DEFAULT 'INDIVIDUAL',
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "password" TEXT,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "personId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "access_token" TEXT,
    "token_type" TEXT,
    "scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("provider","provider_account_id")
);

-- CreateTable
CREATE TABLE "medication_schedules" (
    "id" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosage" DOUBLE PRECISION NOT NULL,
    "dosageUnit" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "instructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL,
    "repeatInterval" INTEGER NOT NULL,
    "repeatUnit" TEXT NOT NULL,
    "timesPerDay" INTEGER NOT NULL DEFAULT 1,
    "endByDate" TIMESTAMP(3),
    "animal_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_logs" (
    "id" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "administeredById" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "taskId" TEXT,

    CONSTRAINT "medication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallOutcome" "AssessmentOutcome",
    "summary" TEXT,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_fields" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldValue" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "AssessmentType" NOT NULL,
    "allowCustomFields" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_template_fields" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "FieldType" NOT NULL,
    "placeholder" TEXT,
    "options" TEXT[],
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,

    CONSTRAINT "assessment_template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_activity_logs" (
    "id" TEXT NOT NULL,
    "activityType" "AnimalActivityType" NOT NULL,
    "animalId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changeSummary" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AnimalToBreed" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AnimalToBreed_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AnimalToColor" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AnimalToColor_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AnimalToCharacteristic" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AnimalToCharacteristic_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_name_key" ON "partners"("name");

-- CreateIndex
CREATE INDEX "intakes_animalId_idx" ON "intakes"("animalId");

-- CreateIndex
CREATE INDEX "intakes_sourcePartnerId_idx" ON "intakes"("sourcePartnerId");

-- CreateIndex
CREATE INDEX "intakes_staffMemberId_idx" ON "intakes"("staffMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "outcomes_adoptionApplicationId_key" ON "outcomes"("adoptionApplicationId");

-- CreateIndex
CREATE INDEX "outcomes_animalId_idx" ON "outcomes"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "animals_microchipNumber_key" ON "animals"("microchipNumber");

-- CreateIndex
CREATE UNIQUE INDEX "breeds_name_species_id_key" ON "breeds"("name", "species_id");

-- CreateIndex
CREATE UNIQUE INDEX "colors_name_key" ON "colors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "characteristics_name_category_key" ON "characteristics"("name", "category");

-- CreateIndex
CREATE INDEX "notes_animal_id_idx" ON "notes"("animal_id");

-- CreateIndex
CREATE INDEX "tasks_animal_id_idx" ON "tasks"("animal_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_idx" ON "tasks"("assignee_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "medical_records_animal_id_idx" ON "medical_records"("animal_id");

-- CreateIndex
CREATE UNIQUE INDEX "foster_profiles_person_id_key" ON "foster_profiles"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "household_profiles_person_id_key" ON "household_profiles"("person_id");

-- CreateIndex
CREATE INDEX "adoption_applications_animal_id_idx" ON "adoption_applications"("animal_id");

-- CreateIndex
CREATE INDEX "adoption_applications_user_id_idx" ON "adoption_applications"("user_id");

-- CreateIndex
CREATE INDEX "adoption_applications_status_idx" ON "adoption_applications"("status");

-- CreateIndex
CREATE INDEX "adoption_applications_animal_id_status_idx" ON "adoption_applications"("animal_id", "status");

-- CreateIndex
CREATE INDEX "application_status_history_application_id_idx" ON "application_status_history"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "likes_user_id_animal_id_key" ON "likes"("user_id", "animal_id");

-- CreateIndex
CREATE UNIQUE INDEX "persons_email_key" ON "persons"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId");

-- CreateIndex
CREATE INDEX "medication_schedules_animal_id_idx" ON "medication_schedules"("animal_id");

-- CreateIndex
CREATE UNIQUE INDEX "medication_logs_taskId_key" ON "medication_logs"("taskId");

-- CreateIndex
CREATE INDEX "medication_logs_animalId_idx" ON "medication_logs"("animalId");

-- CreateIndex
CREATE INDEX "medication_logs_scheduleId_idx" ON "medication_logs"("scheduleId");

-- CreateIndex
CREATE INDEX "assessments_animalId_idx" ON "assessments"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_templates_name_key" ON "assessment_templates"("name");

-- CreateIndex
CREATE INDEX "_AnimalToBreed_B_index" ON "_AnimalToBreed"("B");

-- CreateIndex
CREATE INDEX "_AnimalToColor_B_index" ON "_AnimalToColor"("B");

-- CreateIndex
CREATE INDEX "_AnimalToCharacteristic_B_index" ON "_AnimalToCharacteristic"("B");

-- AddForeignKey
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_surrenderingPersonId_fkey" FOREIGN KEY ("surrenderingPersonId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_foundByPersonId_fkey" FOREIGN KEY ("foundByPersonId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_sourcePartnerId_fkey" FOREIGN KEY ("sourcePartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_adoptionApplicationId_fkey" FOREIGN KEY ("adoptionApplicationId") REFERENCES "adoption_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_destinationPartnerId_fkey" FOREIGN KEY ("destinationPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_foster_profile_id_fkey" FOREIGN KEY ("foster_profile_id") REFERENCES "foster_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_profiles" ADD CONSTRAINT "foster_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_profiles" ADD CONSTRAINT "household_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "adoption_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_images" ADD CONSTRAINT "animal_images_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_administeredById_fkey" FOREIGN KEY ("administeredById") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "medication_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_logs" ADD CONSTRAINT "medication_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_fields" ADD CONSTRAINT "assessment_fields_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_template_fields" ADD CONSTRAINT "assessment_template_fields_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_activity_logs" ADD CONSTRAINT "animal_activity_logs_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_activity_logs" ADD CONSTRAINT "animal_activity_logs_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AnimalToBreed" ADD CONSTRAINT "_AnimalToBreed_A_fkey" FOREIGN KEY ("A") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AnimalToBreed" ADD CONSTRAINT "_AnimalToBreed_B_fkey" FOREIGN KEY ("B") REFERENCES "breeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AnimalToColor" ADD CONSTRAINT "_AnimalToColor_A_fkey" FOREIGN KEY ("A") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AnimalToColor" ADD CONSTRAINT "_AnimalToColor_B_fkey" FOREIGN KEY ("B") REFERENCES "colors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AnimalToCharacteristic" ADD CONSTRAINT "_AnimalToCharacteristic_A_fkey" FOREIGN KEY ("A") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AnimalToCharacteristic" ADD CONSTRAINT "_AnimalToCharacteristic_B_fkey" FOREIGN KEY ("B") REFERENCES "characteristics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
