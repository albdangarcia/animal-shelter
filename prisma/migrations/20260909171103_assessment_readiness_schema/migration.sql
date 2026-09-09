-- CreateEnum
CREATE TYPE "AssessmentSignal" AS ENUM ('NO_CONCERNS', 'MONITOR', 'FOLLOW_UP', 'ESCALATE');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'SINGLE_SELECT', 'MULTI_SELECT', 'BOOLEAN');

-- CreateTable
CREATE TABLE "assessment_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "species" TEXT,
    "stage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_template_fields" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "FieldType" NOT NULL,
    "options" TEXT[],
    "concerningValues" TEXT[],
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signal" "AssessmentSignal" NOT NULL DEFAULT 'NO_CONCERNS',
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_answers" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "templateFieldId" TEXT NOT NULL,
    "questionLabel" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueNumber" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_templates_supersededById_key" ON "assessment_templates"("supersededById");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_templates_key_version_key" ON "assessment_templates"("key", "version");

-- CreateIndex
CREATE INDEX "assessment_template_fields_templateId_idx" ON "assessment_template_fields"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_template_fields_templateId_key_key" ON "assessment_template_fields"("templateId", "key");

-- CreateIndex
CREATE INDEX "assessments_animalId_observed_at_idx" ON "assessments"("animalId", "observed_at");

-- CreateIndex
CREATE INDEX "assessments_templateId_idx" ON "assessments"("templateId");

-- CreateIndex
CREATE INDEX "assessment_answers_assessmentId_idx" ON "assessment_answers"("assessmentId");

-- CreateIndex
CREATE INDEX "assessment_answers_templateFieldId_idx" ON "assessment_answers"("templateFieldId");

-- AddForeignKey
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "assessment_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_template_fields" ADD CONSTRAINT "assessment_template_fields_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_templateFieldId_fkey" FOREIGN KEY ("templateFieldId") REFERENCES "assessment_template_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
