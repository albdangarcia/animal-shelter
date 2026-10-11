-- AlterEnum
BEGIN;
CREATE TYPE "AnimalActivityType_new" AS ENUM ('FIELD_UPDATE', 'NOTE_ADDED', 'PHOTO_UPLOADED', 'ASSESSMENT_COMPLETED', 'VITALS_RECORDED', 'TASK_CREATED', 'TASK_STATUS_CHANGED', 'TASK_UPDATED', 'TASK_ASSIGNED', 'STATUS_CHANGE', 'INTAKE_PROCESSED', 'OUTCOME_PROCESSED', 'CREATED', 'LOCATION_CHANGE', 'FOSTER_PLACED', 'FOSTER_RETURNED', 'NOTE_EDITED', 'NOTE_DELETED', 'NOTE_RESTORED', 'OUTCOME_CORRECTED', 'OUTCOME_REVERSED', 'INTAKE_CORRECTED');
ALTER TABLE "animal_activity_logs" ALTER COLUMN "activityType" TYPE "AnimalActivityType_new" USING ("activityType"::text::"AnimalActivityType_new");
ALTER TYPE "AnimalActivityType" RENAME TO "AnimalActivityType_old";
ALTER TYPE "AnimalActivityType_new" RENAME TO "AnimalActivityType";
DROP TYPE "AnimalActivityType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "medical_records" DROP CONSTRAINT "medical_records_animal_id_fkey";

-- DropForeignKey
ALTER TABLE "medication_schedules" DROP CONSTRAINT "medication_schedules_animal_id_fkey";

-- DropForeignKey
ALTER TABLE "medication_logs" DROP CONSTRAINT "medication_logs_administeredById_fkey";

-- DropForeignKey
ALTER TABLE "medication_logs" DROP CONSTRAINT "medication_logs_scheduleId_fkey";

-- DropForeignKey
ALTER TABLE "medication_logs" DROP CONSTRAINT "medication_logs_animalId_fkey";

-- DropForeignKey
ALTER TABLE "medication_logs" DROP CONSTRAINT "medication_logs_taskId_fkey";

-- DropTable
DROP TABLE "medical_records";

-- DropTable
DROP TABLE "medication_schedules";

-- DropTable
DROP TABLE "medication_logs";

-- DropEnum
DROP TYPE "MedicalRecordType";
