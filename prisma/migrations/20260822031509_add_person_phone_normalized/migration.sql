-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "phoneNormalized" TEXT;

-- CreateIndex
CREATE INDEX "persons_phoneNormalized_idx" ON "persons"("phoneNormalized");
