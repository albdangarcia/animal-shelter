-- CreateEnum
CREATE TYPE "MedicalProtocolStepKind" AS ENUM ('VACCINE', 'TEST', 'TREATMENT', 'SPAY_NEUTER', 'EXAM', 'MICROCHIP');

-- AlterEnum
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_PROTOCOL_APPLIED';

-- AlterTable
ALTER TABLE "medical_entries" ADD COLUMN     "protocol_step_id" TEXT;

-- CreateTable
CREATE TABLE "medical_protocols" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species_id" TEXT NOT NULL,
    "min_age_days" INTEGER,
    "max_age_days" INTEGER,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_protocol_steps" (
    "id" TEXT NOT NULL,
    "protocol_id" TEXT NOT NULL,
    "kind" "MedicalProtocolStepKind" NOT NULL,
    "item_id" TEXT,
    "exam_type" "ExamType",
    "offset_days" INTEGER NOT NULL,
    "not_before_age_days" INTEGER,
    "repeat_interval_days" INTEGER,
    "repeat_count" INTEGER,
    "until_age_days" INTEGER,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL,
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_protocol_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medical_protocols_species_id_idx" ON "medical_protocols"("species_id");

-- CreateIndex
CREATE UNIQUE INDEX "medical_protocols_name_key" ON "medical_protocols"("name");

-- CreateIndex
CREATE INDEX "medical_protocol_steps_protocol_id_idx" ON "medical_protocol_steps"("protocol_id");

-- CreateIndex
CREATE INDEX "medical_protocol_steps_item_id_idx" ON "medical_protocol_steps"("item_id");

-- CreateIndex
CREATE INDEX "medical_entries_protocol_step_id_idx" ON "medical_entries"("protocol_step_id");

-- AddForeignKey
ALTER TABLE "medical_entries" ADD CONSTRAINT "medical_entries_protocol_step_id_fkey" FOREIGN KEY ("protocol_step_id") REFERENCES "medical_protocol_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_protocols" ADD CONSTRAINT "medical_protocols_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_protocol_steps" ADD CONSTRAINT "medical_protocol_steps_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "medical_protocols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_protocol_steps" ADD CONSTRAINT "medical_protocol_steps_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "medical_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
