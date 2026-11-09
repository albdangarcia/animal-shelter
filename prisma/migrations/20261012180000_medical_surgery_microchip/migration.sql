-- CreateEnum
CREATE TYPE "SurgeryProcedure" AS ENUM ('SPAY', 'NEUTER', 'DENTAL', 'AMPUTATION', 'ENUCLEATION', 'MASS_REMOVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SurgeryEvidence" AS ENUM ('OWNER_RECORDS', 'VET_RECORDS', 'TATTOO', 'SCAR', 'FOUND_ON_EXAM');

-- CreateEnum
CREATE TYPE "SpayNeuterExemptionReason" AS ENUM ('TOO_YOUNG_OR_UNDERWEIGHT', 'MEDICAL_RISK', 'PARTNER_WILL_ALTER', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MedicalEntryKind" ADD VALUE 'SURGERY';
ALTER TYPE "MedicalEntryKind" ADD VALUE 'MICROCHIP';

-- AlterTable
ALTER TABLE "medical_entries" ADD COLUMN     "chip_number" TEXT,
ADD COLUMN     "exemption_reason" "SpayNeuterExemptionReason",
ADD COLUMN     "procedure" "SurgeryProcedure",
ADD COLUMN     "review_date" TEXT,
ALTER COLUMN "item_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "surgery_details" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "surgeon" TEXT,
    "findings" TEXT,
    "anesthesia_notes" TEXT,
    "evidence" "SurgeryEvidence",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "surgery_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "microchip_details" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "brand" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microchip_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "surgery_details_entry_id_key" ON "surgery_details"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "microchip_details_entry_id_key" ON "microchip_details"("entry_id");

-- CreateIndex
CREATE INDEX "medical_entries_animal_id_procedure_idx" ON "medical_entries"("animal_id", "procedure");

-- CreateIndex
CREATE UNIQUE INDEX "medical_entries_chip_number_key" ON "medical_entries"("chip_number") WHERE ("voided_at" IS NULL);

-- AddForeignKey
ALTER TABLE "surgery_details" ADD CONSTRAINT "surgery_details_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "microchip_details" ADD CONSTRAINT "microchip_details_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
