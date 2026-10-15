-- CreateEnum
CREATE TYPE "MedicationFrequency" AS ENUM ('SID', 'BID', 'TID', 'EVERY_N_DAYS', 'PRN');

-- CreateEnum
CREATE TYPE "DoseSlot" AS ENUM ('AM', 'MIDDAY', 'PM');

-- CreateEnum
CREATE TYPE "MedicationDoseResult" AS ENUM ('GIVEN', 'REFUSED', 'NOT_GIVEN');

-- CreateEnum
CREATE TYPE "MedicationOrderEventAction" AS ENUM ('CREATED', 'EDITED', 'DISCONTINUED', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICATION_ORDERED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICATION_ORDER_EDITED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICATION_DISCONTINUED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICATION_ORDER_VOIDED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICATION_DOSE_NOT_GIVEN';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICATION_DOSE_VOIDED';

-- AlterEnum
ALTER TYPE "MedicalItemKind" ADD VALUE 'MEDICATION';

-- AlterTable
ALTER TABLE "shelter_settings" ADD COLUMN     "amDoseEndTime" TEXT NOT NULL DEFAULT '10:00',
ADD COLUMN     "middayDoseEndTime" TEXT NOT NULL DEFAULT '14:00',
ADD COLUMN     "pmDoseEndTime" TEXT NOT NULL DEFAULT '20:00';

-- CreateTable
CREATE TABLE "medication_orders" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "dose_amount" DOUBLE PRECISION NOT NULL,
    "dose_unit" "DoseUnit" NOT NULL,
    "route" "MedicalRoute" NOT NULL,
    "frequency" "MedicationFrequency" NOT NULL,
    "interval_days" INTEGER,
    "start_date" TEXT NOT NULL,
    "first_slot" "DoseSlot",
    "end_date" TEXT,
    "instructions" TEXT,
    "prescribed_by" TEXT,
    "discontinued_date" TEXT,
    "discontinue_reason" TEXT,
    "discontinued_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "action" "MedicationOrderEventAction" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_doses" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "slot_date" TEXT NOT NULL,
    "slot" "DoseSlot",
    "result" "MedicationDoseResult" NOT NULL,
    "reason" TEXT,
    "administered_at" TIMESTAMP(3) NOT NULL,
    "administered_by_id" TEXT NOT NULL,
    "notes" TEXT,
    "batch_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_doses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medication_orders_animal_id_idx" ON "medication_orders"("animal_id");

-- CreateIndex
CREATE INDEX "medication_orders_item_id_idx" ON "medication_orders"("item_id");

-- CreateIndex
CREATE INDEX "medication_order_events_order_id_idx" ON "medication_order_events"("order_id");

-- CreateIndex
CREATE INDEX "medication_doses_animal_id_slot_date_idx" ON "medication_doses"("animal_id", "slot_date");

-- CreateIndex
CREATE UNIQUE INDEX "medication_doses_order_id_slot_date_slot_key" ON "medication_doses"("order_id", "slot_date", "slot") WHERE ("voided_at" IS NULL);

-- AddForeignKey
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "medical_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_discontinued_by_id_fkey" FOREIGN KEY ("discontinued_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_orders" ADD CONSTRAINT "medication_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_order_events" ADD CONSTRAINT "medication_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "medication_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_order_events" ADD CONSTRAINT "medication_order_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "medication_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_administered_by_id_fkey" FOREIGN KEY ("administered_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
