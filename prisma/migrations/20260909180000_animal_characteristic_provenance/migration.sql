-- Replace the implicit Animal <-> Characteristic many-to-many with an explicit
-- join model that records provenance.

-- CreateTable
CREATE TABLE "animal_characteristics" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "characteristicId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceAssessmentId" TEXT,
    "note" TEXT,
    "removed_at" TIMESTAMP(3),
    "removedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animal_characteristics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "animal_characteristics_characteristicId_idx" ON "animal_characteristics"("characteristicId");

-- CreateIndex
CREATE INDEX "animal_characteristics_sourceAssessmentId_idx" ON "animal_characteristics"("sourceAssessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "animal_characteristics_animalId_characteristicId_key" ON "animal_characteristics"("animalId", "characteristicId");

-- AddForeignKey
ALTER TABLE "animal_characteristics" ADD CONSTRAINT "animal_characteristics_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_characteristics" ADD CONSTRAINT "animal_characteristics_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "characteristics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_characteristics" ADD CONSTRAINT "animal_characteristics_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_characteristics" ADD CONSTRAINT "animal_characteristics_sourceAssessmentId_fkey" FOREIGN KEY ("sourceAssessmentId") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_characteristics" ADD CONSTRAINT "animal_characteristics_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: carry every existing implicit assignment into the explicit table.
-- Pre-provenance links get the earliest admin/staff person as the assigner and
-- the migration time as the date — the honest "assigned before this was
-- tracked" answer. If no such person exists (a fresh database), there are no
-- rows to carry either, so nothing is lost.
INSERT INTO "animal_characteristics" (
    "id", "animalId", "characteristicId", "assignedById",
    "assigned_at", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    j."A",
    j."B",
    backfill_person."id",
    NOW(), NOW(), NOW()
FROM "_AnimalToCharacteristic" j
CROSS JOIN LATERAL (
    SELECT p."id"
    FROM "persons" p
    JOIN "users" u ON u."personId" = p."id"
    WHERE u."role" IN ('ADMIN', 'STAFF')
    ORDER BY u."created_at" ASC, u."id" ASC
    LIMIT 1
) AS backfill_person;

-- DropForeignKey
ALTER TABLE "_AnimalToCharacteristic" DROP CONSTRAINT "_AnimalToCharacteristic_A_fkey";

-- DropForeignKey
ALTER TABLE "_AnimalToCharacteristic" DROP CONSTRAINT "_AnimalToCharacteristic_B_fkey";

-- DropTable
DROP TABLE "_AnimalToCharacteristic";
