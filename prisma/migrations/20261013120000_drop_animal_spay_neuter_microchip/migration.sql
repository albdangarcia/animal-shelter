-- DropIndex
DROP INDEX "animals_microchipNumber_key";

-- AlterTable
ALTER TABLE "animals" DROP COLUMN "isSpayedNeutered",
DROP COLUMN "microchipNumber";
