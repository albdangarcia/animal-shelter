-- AlterTable
ALTER TABLE "medical_entries" ADD COLUMN     "batch_id" TEXT;

-- CreateIndex
CREATE INDEX "medical_entries_batch_id_idx" ON "medical_entries"("batch_id");
