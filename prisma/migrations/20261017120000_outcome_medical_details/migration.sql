-- CreateEnum
CREATE TYPE "EuthanasiaReasonCategory" AS ENUM ('MEDICAL', 'BEHAVIORAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DeathCircumstances" AS ENUM ('FOUND_DEAD', 'DURING_PROCEDURE', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MedicalEntryKind" ADD VALUE 'EUTHANASIA';
ALTER TYPE "MedicalEntryKind" ADD VALUE 'DEATH';

-- AlterTable
ALTER TABLE "medical_entries" ADD COLUMN     "outcome_id" TEXT;

-- CreateTable
CREATE TABLE "euthanasia_details" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "reason_category" "EuthanasiaReasonCategory" NOT NULL,
    "reason_notes" TEXT,
    "authorized_by_id" TEXT NOT NULL,
    "performed_by_id" TEXT,
    "performed_by_name" TEXT,
    "drug" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "witness" TEXT,
    "body_disposition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "euthanasia_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "death_details" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "circumstances" "DeathCircumstances" NOT NULL,
    "circumstance_notes" TEXT,
    "cause" TEXT,
    "necropsy_requested" BOOLEAN,
    "body_disposition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "death_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "euthanasia_details_entry_id_key" ON "euthanasia_details"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "death_details_entry_id_key" ON "death_details"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "medical_entries_outcome_id_key" ON "medical_entries"("outcome_id");

-- AddForeignKey
ALTER TABLE "medical_entries" ADD CONSTRAINT "medical_entries_outcome_id_fkey" FOREIGN KEY ("outcome_id") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "euthanasia_details" ADD CONSTRAINT "euthanasia_details_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "euthanasia_details" ADD CONSTRAINT "euthanasia_details_authorized_by_id_fkey" FOREIGN KEY ("authorized_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "euthanasia_details" ADD CONSTRAINT "euthanasia_details_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "death_details" ADD CONSTRAINT "death_details_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
