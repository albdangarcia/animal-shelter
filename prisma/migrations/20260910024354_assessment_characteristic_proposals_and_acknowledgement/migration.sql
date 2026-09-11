-- AlterTable
-- proposesOnValues carries a transient empty-array default so rows written
-- before this migration stay valid; the app always supplies the value.
ALTER TABLE "assessment_template_fields" ADD COLUMN     "proposesCharacteristicId" TEXT,
ADD COLUMN     "proposesOnValues" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "assessment_template_fields" ALTER COLUMN "proposesOnValues" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "assessment_template_fields_proposesCharacteristicId_idx" ON "assessment_template_fields"("proposesCharacteristicId");

-- AddForeignKey
ALTER TABLE "assessment_template_fields" ADD CONSTRAINT "assessment_template_fields_proposesCharacteristicId_fkey" FOREIGN KEY ("proposesCharacteristicId") REFERENCES "characteristics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
