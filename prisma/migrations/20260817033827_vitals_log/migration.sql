/*
  Warnings:

  - You are about to drop the column `weight_kg` on the `animals` table. All the data in the column will be lost.

  DESTRUCTIVE, NO BACKFILL: this migration assumes there is no existing weight_kg
  data worth preserving (true for this demo app's seed-driven dev/staging DBs). A
  naive `UPDATE animals SET current_weight_grams = ROUND(weight_kg * 1000)` would
  NOT be a safe substitute — it would leave current_weight_grams populated with no
  VitalsLog row behind it, violating the cache invariant (currentWeightGrams must
  equal the latest non-deleted VitalsLog entry's weight), and the next vitals
  write anywhere for that animal would silently blank it back to null via
  recomputeCurrentWeight. A correct backfill needs one VitalsLog row per animal
  that had a weight_kg, not just a column copy — and recordedById is NOT NULL
  with no honest historical value, since nobody actually recorded those legacy
  weights as a dated observation. A deployment with real existing weight data
  needs its own backfill strategy (e.g. attributing legacy rows to a system/
  migration actor) before this migration can run against it.

*/
-- AlterEnum
ALTER TYPE "AnimalActivityType" ADD VALUE 'VITALS_RECORDED';

-- AlterTable
ALTER TABLE "animals" DROP COLUMN "weight_kg",
ADD COLUMN     "current_weight_grams" INTEGER;

-- CreateTable
CREATE TABLE "vitals_logs" (
    "id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight_grams" INTEGER,
    "temperature_c" DOUBLE PRECISION,
    "body_condition_score" INTEGER,
    "notes" TEXT,
    "animal_id" TEXT NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vitals_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vitals_logs_animal_id_recorded_at_idx" ON "vitals_logs"("animal_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "vitals_logs" ADD CONSTRAINT "vitals_logs_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals_logs" ADD CONSTRAINT "vitals_logs_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
