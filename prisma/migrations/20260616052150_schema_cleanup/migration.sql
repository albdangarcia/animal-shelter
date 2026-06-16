-- DropForeignKey
ALTER TABLE "adoption_applications" DROP CONSTRAINT "adoption_applications_user_id_fkey";

-- DropIndex
DROP INDEX "adoption_applications_user_id_idx";

-- AlterTable
ALTER TABLE "adoption_applications" RENAME COLUMN "user_id" TO "applicant_id";

-- AlterTable
ALTER TABLE "animals" DROP COLUMN "archiveReason",
ADD COLUMN     "archiveReason" "OutcomeType";

-- AlterTable
ALTER TABLE "persons" DROP COLUMN "type";

-- DropEnum
DROP TYPE "AnimalArchiveReason";

-- DropEnum
DROP TYPE "PersonType";

-- CreateIndex
CREATE INDEX "adoption_applications_applicant_id_idx" ON "adoption_applications"("applicant_id");

-- AddForeignKey
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
