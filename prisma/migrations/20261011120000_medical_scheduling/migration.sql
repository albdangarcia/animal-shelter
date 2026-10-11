-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_ENTRY_SCHEDULED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_ENTRY_RESCHEDULED';
ALTER TYPE "AnimalActivityType" ADD VALUE 'MEDICAL_ENTRY_DECLINED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MedicalEntryEventAction" ADD VALUE 'COMPLETED';
ALTER TYPE "MedicalEntryEventAction" ADD VALUE 'RESCHEDULED';
ALTER TYPE "MedicalEntryEventAction" ADD VALUE 'DECLINED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MedicalEntryStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "MedicalEntryStatus" ADD VALUE 'DECLINED';

-- AlterTable
ALTER TABLE "medical_entries" ADD COLUMN     "decline_reason" TEXT,
ADD COLUMN     "due_date" TEXT,
ALTER COLUMN "source" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "medical_entries_status_due_date_idx" ON "medical_entries"("status", "due_date");
