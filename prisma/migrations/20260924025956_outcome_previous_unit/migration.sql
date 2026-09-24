-- An outcome keeps the unit the animal was in when the outcome took it out,
-- so that reversing the outcome can put the animal back. Existing outcomes get
-- none: nothing recorded which unit the animal was in before them.

-- AlterTable
ALTER TABLE "outcomes" ADD COLUMN     "previousUnitId" TEXT;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_previousUnitId_fkey" FOREIGN KEY ("previousUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
