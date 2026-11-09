-- CreateEnum
CREATE TYPE "MedicalConditionType" AS ENUM ('CONDITION', 'ALLERGY');

-- CreateEnum
CREATE TYPE "MedicalConditionStatus" AS ENUM ('ACTIVE', 'CHRONIC', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MedicalConditionEventAction" AS ENUM ('CREATED', 'EDITED', 'VOIDED');

-- CreateEnum
CREATE TYPE "CareEpisodeType" AS ENUM ('UNDER_VET_CARE', 'HOSPITALISED_IN_HOUSE', 'HOSPITALISED_OFF_SITE');

-- CreateEnum
CREATE TYPE "CareEpisodeEventAction" AS ENUM ('OPENED', 'CLOSED', 'EDITED', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_CONDITION_ADDED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_CONDITION_EDITED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_CONDITION_VOIDED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'CARE_EPISODE_OPENED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'CARE_EPISODE_CLOSED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'CARE_EPISODE_EDITED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'CARE_EPISODE_VOIDED';

-- AlterTable
ALTER TABLE "animal_characteristics" ADD COLUMN     "sourceConditionId" TEXT;

-- CreateTable
CREATE TABLE "medical_conditions" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "type" "MedicalConditionType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MedicalConditionStatus" NOT NULL,
    "onset_date" TEXT,
    "resolved_date" TEXT,
    "diagnosed_by" TEXT,
    "notes" TEXT,
    "source_entry_id" TEXT,
    "characteristic_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_condition_events" (
    "id" TEXT NOT NULL,
    "condition_id" TEXT NOT NULL,
    "action" "MedicalConditionEventAction" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_condition_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_episodes" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "type" "CareEpisodeType" NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "partner_id" TEXT,
    "opened_by_id" TEXT NOT NULL,
    "closed_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_episode_events" (
    "id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "action" "CareEpisodeEventAction" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_episode_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medical_conditions_animal_id_idx" ON "medical_conditions"("animal_id");

-- CreateIndex
CREATE INDEX "medical_conditions_source_entry_id_idx" ON "medical_conditions"("source_entry_id");

-- CreateIndex
CREATE INDEX "medical_condition_events_condition_id_idx" ON "medical_condition_events"("condition_id");

-- CreateIndex
CREATE INDEX "care_episodes_animal_id_idx" ON "care_episodes"("animal_id");

-- CreateIndex
CREATE UNIQUE INDEX "care_episodes_animal_id_key" ON "care_episodes"("animal_id") WHERE ("end_date" IS NULL AND "voided_at" IS NULL);

-- CreateIndex
CREATE INDEX "care_episode_events_episode_id_idx" ON "care_episode_events"("episode_id");

-- CreateIndex
CREATE INDEX "animal_characteristics_sourceConditionId_idx" ON "animal_characteristics"("sourceConditionId");

-- AddForeignKey
ALTER TABLE "animal_characteristics" ADD CONSTRAINT "animal_characteristics_sourceConditionId_fkey" FOREIGN KEY ("sourceConditionId") REFERENCES "medical_conditions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_conditions" ADD CONSTRAINT "medical_conditions_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_conditions" ADD CONSTRAINT "medical_conditions_source_entry_id_fkey" FOREIGN KEY ("source_entry_id") REFERENCES "medical_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_conditions" ADD CONSTRAINT "medical_conditions_characteristic_id_fkey" FOREIGN KEY ("characteristic_id") REFERENCES "characteristics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_conditions" ADD CONSTRAINT "medical_conditions_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_conditions" ADD CONSTRAINT "medical_conditions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_condition_events" ADD CONSTRAINT "medical_condition_events_condition_id_fkey" FOREIGN KEY ("condition_id") REFERENCES "medical_conditions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_condition_events" ADD CONSTRAINT "medical_condition_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episodes" ADD CONSTRAINT "care_episodes_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episode_events" ADD CONSTRAINT "care_episode_events_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "care_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_episode_events" ADD CONSTRAINT "care_episode_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
