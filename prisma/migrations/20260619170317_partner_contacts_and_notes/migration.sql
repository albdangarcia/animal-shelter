/*
  Warnings:

  - You are about to drop the column `contactPerson` on the `partners` table. All the data in the column will be lost.
  - The `notes` table is renamed to `animal_notes` (data preserved).

*/
-- AlterTable
ALTER TABLE "breeds" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "colors" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "partners" DROP COLUMN "contactPerson",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "species" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- RenameTable (preserves all existing note data)
ALTER TABLE "notes" RENAME TO "animal_notes";

-- Rename the table's constraints and index to match the new table name
ALTER TABLE "animal_notes" RENAME CONSTRAINT "notes_pkey" TO "animal_notes_pkey";
ALTER TABLE "animal_notes" RENAME CONSTRAINT "notes_animal_id_fkey" TO "animal_notes_animal_id_fkey";
ALTER TABLE "animal_notes" RENAME CONSTRAINT "notes_author_id_fkey" TO "animal_notes_author_id_fkey";
ALTER INDEX "notes_animal_id_idx" RENAME TO "animal_notes_animal_id_idx";

-- CreateTable
CREATE TABLE "partner_contacts" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_notes" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "author_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "person_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_notes" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "author_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "partner_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_contacts_partnerId_personId_key" ON "partner_contacts"("partnerId", "personId");

-- CreateIndex
CREATE INDEX "person_notes_person_id_idx" ON "person_notes"("person_id");

-- CreateIndex
CREATE INDEX "partner_notes_partner_id_idx" ON "partner_notes"("partner_id");

-- AddForeignKey
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_notes" ADD CONSTRAINT "partner_notes_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_notes" ADD CONSTRAINT "partner_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;