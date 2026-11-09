-- CreateEnum
CREATE TYPE "MedicalDocumentType" AS ENUM ('LAB_RESULT', 'VET_RECORD', 'IMAGING', 'PRESCRIPTION', 'CONSENT_FORM', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicalDocumentEventAction" AS ENUM ('CREATED', 'EDITED', 'VOIDED', 'FILE_REMOVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_DOCUMENT_ADDED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_DOCUMENT_EDITED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_DOCUMENT_VOIDED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_DOCUMENT_FILE_REMOVED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'VET_VISIT_REPORTED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'VET_VISIT_REPORT_REVIEWED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'VET_VISIT_REPORT_DISMISSED';

-- AlterTable
ALTER TABLE "medical_entries" ADD COLUMN     "reported_by_foster" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vet_report_id" TEXT;

-- AlterTable
ALTER TABLE "medication_doses" ADD COLUMN     "reported_by_foster" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "medical_documents" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "entry_id" TEXT,
    "vet_report_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "MedicalDocumentType" NOT NULL,
    "document_date" TEXT,
    "notes" TEXT,
    "pathname" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "file_removed_at" TIMESTAMP(3),
    "file_removed_by_id" TEXT,
    "file_removal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_document_events" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "action" "MedicalDocumentEventAction" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_document_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_visit_reports" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "reported_by_id" TEXT NOT NULL,
    "visit_date" TEXT NOT NULL,
    "vet_partner_id" TEXT,
    "vet_name" TEXT,
    "summary" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "dismiss_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vet_visit_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medical_documents_pathname_key" ON "medical_documents"("pathname");

-- CreateIndex
CREATE INDEX "medical_documents_animal_id_idx" ON "medical_documents"("animal_id");

-- CreateIndex
CREATE INDEX "medical_documents_entry_id_idx" ON "medical_documents"("entry_id");

-- CreateIndex
CREATE INDEX "medical_documents_vet_report_id_idx" ON "medical_documents"("vet_report_id");

-- CreateIndex
CREATE INDEX "medical_document_events_document_id_idx" ON "medical_document_events"("document_id");

-- CreateIndex
CREATE INDEX "vet_visit_reports_animal_id_idx" ON "vet_visit_reports"("animal_id");

-- CreateIndex
CREATE INDEX "vet_visit_reports_reviewed_at_idx" ON "vet_visit_reports"("reviewed_at");

-- CreateIndex
CREATE INDEX "medical_entries_vet_report_id_idx" ON "medical_entries"("vet_report_id");

-- AddForeignKey
ALTER TABLE "medical_entries" ADD CONSTRAINT "medical_entries_vet_report_id_fkey" FOREIGN KEY ("vet_report_id") REFERENCES "vet_visit_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_vet_report_id_fkey" FOREIGN KEY ("vet_report_id") REFERENCES "vet_visit_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_file_removed_by_id_fkey" FOREIGN KEY ("file_removed_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_document_events" ADD CONSTRAINT "medical_document_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "medical_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_document_events" ADD CONSTRAINT "medical_document_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visit_reports" ADD CONSTRAINT "vet_visit_reports_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visit_reports" ADD CONSTRAINT "vet_visit_reports_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "foster_placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visit_reports" ADD CONSTRAINT "vet_visit_reports_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visit_reports" ADD CONSTRAINT "vet_visit_reports_vet_partner_id_fkey" FOREIGN KEY ("vet_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visit_reports" ADD CONSTRAINT "vet_visit_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
