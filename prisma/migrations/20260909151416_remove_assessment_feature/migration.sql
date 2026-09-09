-- DropForeignKey
ALTER TABLE "assessment_fields" DROP CONSTRAINT "assessment_fields_assessmentId_fkey";

-- DropForeignKey
ALTER TABLE "assessment_template_fields" DROP CONSTRAINT "assessment_template_fields_templateId_fkey";

-- DropForeignKey
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_animalId_fkey";

-- DropForeignKey
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_assessorId_fkey";

-- DropForeignKey
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_templateId_fkey";

-- DropTable
DROP TABLE "assessment_fields";

-- DropTable
DROP TABLE "assessment_template_fields";

-- DropTable
DROP TABLE "assessment_templates";

-- DropTable
DROP TABLE "assessments";

-- DropEnum
DROP TYPE "AssessmentOutcome";

-- DropEnum
DROP TYPE "AssessmentType";

-- DropEnum
DROP TYPE "FieldType";

