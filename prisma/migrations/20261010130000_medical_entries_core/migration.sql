-- CreateEnum
CREATE TYPE "MedicalItemKind" AS ENUM ('VACCINE', 'TEST', 'TREATMENT');

-- CreateEnum
CREATE TYPE "MedicalEntryKind" AS ENUM ('VACCINE', 'TEST', 'TREATMENT');

-- CreateEnum
CREATE TYPE "MedicalEntryStatus" AS ENUM ('COMPLETED');

-- CreateEnum
CREATE TYPE "MedicalEntrySource" AS ENUM ('IN_HOUSE', 'OUTSIDE_VET', 'BEFORE_INTAKE');

-- CreateEnum
CREATE TYPE "MedicalEntryEventAction" AS ENUM ('CREATED', 'EDITED', 'VOIDED');

-- CreateEnum
CREATE TYPE "TestResult" AS ENUM ('POSITIVE', 'NEGATIVE', 'INCONCLUSIVE', 'INVALID');

-- CreateEnum
CREATE TYPE "MedicalRoute" AS ENUM ('ORAL', 'SUBCUTANEOUS', 'INTRAMUSCULAR', 'INTRANASAL', 'TOPICAL', 'OPHTHALMIC', 'OTIC', 'INTRAVENOUS', 'TRANSDERMAL');

-- CreateEnum
CREATE TYPE "DoseUnit" AS ENUM ('MG', 'ML', 'TABLET', 'CAPSULE', 'DROP', 'APPLICATION', 'UNIT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_ENTRY_RECORDED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_ENTRY_EDITED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_ENTRY_VOIDED';

-- CreateTable
CREATE TABLE "medical_items" (
    "id" TEXT NOT NULL,
    "kind" "MedicalItemKind" NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "default_route" "MedicalRoute",
    "default_dose_amount" DOUBLE PRECISION,
    "default_dose_unit" "DoseUnit",
    "repeat_interval_days" INTEGER,
    "is_rabies" BOOLEAN NOT NULL DEFAULT false,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_item_analytes" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_item_analytes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_entries" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "kind" "MedicalEntryKind" NOT NULL,
    "item_id" TEXT NOT NULL,
    "status" "MedicalEntryStatus" NOT NULL,
    "completed_date" TEXT,
    "source" "MedicalEntrySource" NOT NULL,
    "vet_partner_id" TEXT,
    "vet_name" TEXT,
    "administered_by_id" TEXT,
    "notes" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccine_details" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "manufacturer" TEXT,
    "lot_number" TEXT,
    "lot_expiry_date" TEXT,
    "route" "MedicalRoute",
    "site" TEXT,
    "rabies_tag_number" TEXT,
    "duration_months" INTEGER,
    "valid_until_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaccine_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_details" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "lot_number" TEXT,
    "lot_expiry_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_analyte_results" (
    "id" TEXT NOT NULL,
    "test_details_id" TEXT NOT NULL,
    "analyte_id" TEXT NOT NULL,
    "analyte_name" TEXT NOT NULL,
    "result" "TestResult" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_analyte_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_details" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "dose_amount" DOUBLE PRECISION,
    "dose_unit" "DoseUnit",
    "route" "MedicalRoute",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_entry_events" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "action" "MedicalEntryEventAction" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_entry_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MedicalItemSpecies" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MedicalItemSpecies_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "medical_items_kind_name_key" ON "medical_items"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "medical_item_analytes_item_id_name_key" ON "medical_item_analytes"("item_id", "name");

-- CreateIndex
CREATE INDEX "medical_entries_animal_id_kind_idx" ON "medical_entries"("animal_id", "kind");

-- CreateIndex
CREATE INDEX "medical_entries_item_id_idx" ON "medical_entries"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "vaccine_details_entry_id_key" ON "vaccine_details"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_details_entry_id_key" ON "test_details"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_analyte_results_test_details_id_analyte_id_key" ON "test_analyte_results"("test_details_id", "analyte_id");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_details_entry_id_key" ON "treatment_details"("entry_id");

-- CreateIndex
CREATE INDEX "medical_entry_events_entry_id_idx" ON "medical_entry_events"("entry_id");

-- CreateIndex
CREATE INDEX "_MedicalItemSpecies_B_index" ON "_MedicalItemSpecies"("B");

-- AddForeignKey
ALTER TABLE "medical_item_analytes" ADD CONSTRAINT "medical_item_analytes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "medical_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_entries" ADD CONSTRAINT "medical_entries_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_entries" ADD CONSTRAINT "medical_entries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "medical_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_entries" ADD CONSTRAINT "medical_entries_vet_partner_id_fkey" FOREIGN KEY ("vet_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_entries" ADD CONSTRAINT "medical_entries_administered_by_id_fkey" FOREIGN KEY ("administered_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_entries" ADD CONSTRAINT "medical_entries_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_entries" ADD CONSTRAINT "medical_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccine_details" ADD CONSTRAINT "vaccine_details_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_details" ADD CONSTRAINT "test_details_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_analyte_results" ADD CONSTRAINT "test_analyte_results_test_details_id_fkey" FOREIGN KEY ("test_details_id") REFERENCES "test_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_analyte_results" ADD CONSTRAINT "test_analyte_results_analyte_id_fkey" FOREIGN KEY ("analyte_id") REFERENCES "medical_item_analytes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_details" ADD CONSTRAINT "treatment_details_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_entry_events" ADD CONSTRAINT "medical_entry_events_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_entry_events" ADD CONSTRAINT "medical_entry_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MedicalItemSpecies" ADD CONSTRAINT "_MedicalItemSpecies_A_fkey" FOREIGN KEY ("A") REFERENCES "medical_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MedicalItemSpecies" ADD CONSTRAINT "_MedicalItemSpecies_B_fkey" FOREIGN KEY ("B") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;
