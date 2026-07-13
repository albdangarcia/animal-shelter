/*
  Warnings:

  - You are about to drop the column `foster_profile_id` on the `animals` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `foster_profiles` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "FosterStatus" AS ENUM ('ACTIVE', 'PAUSED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FosterPlacementType" AS ENUM ('GENERAL', 'MEDICAL', 'FOSTER_TO_ADOPT', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "FosterReturnReason" AS ENUM ('RETURNED_TO_SHELTER', 'ADOPTED_BY_FOSTER', 'TRANSFERRED', 'MEDICAL', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AnimalActivityType" ADD VALUE 'FOSTER_PLACED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'FOSTER_RETURNED';

-- DropForeignKey
ALTER TABLE "animals" DROP CONSTRAINT "animals_foster_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "foster_profiles" DROP CONSTRAINT "foster_profiles_person_id_fkey";

-- AlterTable
ALTER TABLE "animals" DROP COLUMN "foster_profile_id";

-- AlterTable
ALTER TABLE "foster_profiles" DROP COLUMN "is_active",
ADD COLUMN     "accepts_hospice" BOOLEAN,
ADD COLUMN     "accepts_medical" BOOLEAN,
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "availability_notes" TEXT,
ADD COLUMN     "can_bottle_feed" BOOLEAN,
ADD COLUMN     "can_give_oral_meds" BOOLEAN,
ADD COLUMN     "can_transport" BOOLEAN,
ADD COLUMN     "has_quarantine_space" BOOLEAN,
ADD COLUMN     "max_animals" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" "FosterStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "foster_applications" (
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
    "max_animals" INTEGER NOT NULL DEFAULT 1,
    "has_quarantine_space" BOOLEAN,
    "can_give_oral_meds" BOOLEAN,
    "can_bottle_feed" BOOLEAN,
    "can_transport" BOOLEAN,
    "accepts_medical" BOOLEAN,
    "accepts_hospice" BOOLEAN,
    "availability_notes" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "internalNotes" TEXT,
    "person_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foster_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foster_application_status_history" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL,
    "statusChangeReason" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" TEXT,

    CONSTRAINT "foster_application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foster_placements" (
    "id" TEXT NOT NULL,
    "type" "FosterPlacementType" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_end_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "return_reason" "FosterReturnReason",
    "return_notes" TEXT,
    "animal_id" TEXT NOT NULL,
    "foster_profile_id" TEXT NOT NULL,
    "previous_unit_id" TEXT,
    "previous_listing_status" "AnimalListingStatus",
    "placed_by_id" TEXT NOT NULL,
    "returned_by_id" TEXT,
    "adoption_application_id" TEXT,
    "outcome_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foster_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FosterProfileSpeciesCapability" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FosterProfileSpeciesCapability_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_FosterApplicationSpeciesCapability" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FosterApplicationSpeciesCapability_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "foster_applications_person_id_idx" ON "foster_applications"("person_id");

-- CreateIndex
CREATE INDEX "foster_applications_status_idx" ON "foster_applications"("status");

-- CreateIndex
CREATE INDEX "foster_application_status_history_application_id_idx" ON "foster_application_status_history"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "foster_placements_adoption_application_id_key" ON "foster_placements"("adoption_application_id");

-- CreateIndex
CREATE UNIQUE INDEX "foster_placements_outcome_id_key" ON "foster_placements"("outcome_id");

-- CreateIndex
CREATE INDEX "foster_placements_animal_id_idx" ON "foster_placements"("animal_id");

-- CreateIndex
CREATE INDEX "foster_placements_foster_profile_id_idx" ON "foster_placements"("foster_profile_id");

-- CreateIndex
CREATE INDEX "_FosterProfileSpeciesCapability_B_index" ON "_FosterProfileSpeciesCapability"("B");

-- CreateIndex
CREATE INDEX "_FosterApplicationSpeciesCapability_B_index" ON "_FosterApplicationSpeciesCapability"("B");

-- AddForeignKey
ALTER TABLE "foster_profiles" ADD CONSTRAINT "foster_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_applications" ADD CONSTRAINT "foster_applications_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_application_status_history" ADD CONSTRAINT "foster_application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "foster_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_application_status_history" ADD CONSTRAINT "foster_application_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_placements" ADD CONSTRAINT "foster_placements_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_placements" ADD CONSTRAINT "foster_placements_foster_profile_id_fkey" FOREIGN KEY ("foster_profile_id") REFERENCES "foster_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_placements" ADD CONSTRAINT "foster_placements_previous_unit_id_fkey" FOREIGN KEY ("previous_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_placements" ADD CONSTRAINT "foster_placements_placed_by_id_fkey" FOREIGN KEY ("placed_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_placements" ADD CONSTRAINT "foster_placements_returned_by_id_fkey" FOREIGN KEY ("returned_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_placements" ADD CONSTRAINT "foster_placements_adoption_application_id_fkey" FOREIGN KEY ("adoption_application_id") REFERENCES "adoption_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foster_placements" ADD CONSTRAINT "foster_placements_outcome_id_fkey" FOREIGN KEY ("outcome_id") REFERENCES "outcomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FosterProfileSpeciesCapability" ADD CONSTRAINT "_FosterProfileSpeciesCapability_A_fkey" FOREIGN KEY ("A") REFERENCES "foster_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FosterProfileSpeciesCapability" ADD CONSTRAINT "_FosterProfileSpeciesCapability_B_fkey" FOREIGN KEY ("B") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FosterApplicationSpeciesCapability" ADD CONSTRAINT "_FosterApplicationSpeciesCapability_A_fkey" FOREIGN KEY ("A") REFERENCES "foster_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FosterApplicationSpeciesCapability" ADD CONSTRAINT "_FosterApplicationSpeciesCapability_B_fkey" FOREIGN KEY ("B") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;
