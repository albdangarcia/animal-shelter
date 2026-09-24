-- An outcome recorded in error can be reversed. A reversal voids the row
-- rather than deleting it: the outcome is kept with who reversed it, when and
-- why, and counts for nothing from then on. Nothing here changes existing
-- data.

-- AlterEnum
ALTER TYPE "AnimalActivityType" ADD VALUE 'OUTCOME_REVERSED';

-- The reversal itself, and the listing status a reversal restores. Existing
-- outcomes get no listing status: nothing recorded what it was before them.
-- AlterTable
ALTER TABLE "outcomes" ADD COLUMN     "previousListingStatus" "AnimalListingStatus",
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT;

-- A reversed adoption keeps its link to the application, so the same
-- application can be adopted again afterwards. What stays unique is the link
-- among outcomes that are not reversed.
-- DropIndex
DROP INDEX "outcomes_adoptionApplicationId_key";

-- CreateIndex
CREATE UNIQUE INDEX "outcomes_adoptionApplicationId_key" ON "outcomes"("adoptionApplicationId") WHERE ("reversedAt" IS NULL);

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
