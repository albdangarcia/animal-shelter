-- CreateEnum
CREATE TYPE "NoteTargetType" AS ENUM ('ANIMAL', 'PERSON', 'PARTNER');

-- CreateEnum
CREATE TYPE "NoteEventAction" AS ENUM ('CREATED', 'EDITED', 'DELETED', 'RESTORED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AnimalActivityType" ADD VALUE 'NOTE_EDITED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'NOTE_DELETED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'NOTE_RESTORED';

-- AlterTable
ALTER TABLE "animal_notes" ADD COLUMN     "last_edited_at" TIMESTAMP(3),
ADD COLUMN     "last_edited_by_id" TEXT;

-- AlterTable
ALTER TABLE "partner_notes" ADD COLUMN     "last_edited_at" TIMESTAMP(3),
ADD COLUMN     "last_edited_by_id" TEXT;

-- AlterTable
ALTER TABLE "person_notes" ADD COLUMN     "last_edited_at" TIMESTAMP(3),
ADD COLUMN     "last_edited_by_id" TEXT;

-- CreateTable
CREATE TABLE "note_events" (
    "id" TEXT NOT NULL,
    "targetType" "NoteTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "action" "NoteEventAction" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_events_targetType_target_id_idx" ON "note_events"("targetType", "target_id");

-- CreateIndex
CREATE INDEX "note_events_actor_id_idx" ON "note_events"("actor_id");

-- AddForeignKey
ALTER TABLE "animal_notes" ADD CONSTRAINT "animal_notes_last_edited_by_id_fkey" FOREIGN KEY ("last_edited_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_last_edited_by_id_fkey" FOREIGN KEY ("last_edited_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_notes" ADD CONSTRAINT "partner_notes_last_edited_by_id_fkey" FOREIGN KEY ("last_edited_by_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_events" ADD CONSTRAINT "note_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
