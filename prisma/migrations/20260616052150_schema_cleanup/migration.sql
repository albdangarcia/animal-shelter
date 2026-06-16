/*
  Warnings:

  - You are about to drop the column `user_id` on the `adoption_applications` table. All the data in the column will be lost.
  - The `archiveReason` column on the `animals` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `type` on the `persons` table. All the data in the column will be lost.
  - Added the required column `applicant_id` to the `adoption_applications` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "adoption_applications" DROP CONSTRAINT "adoption_applications_user_id_fkey";

-- DropIndex
DROP INDEX "adoption_applications_user_id_idx";

-- AlterTable
ALTER TABLE "adoption_applications" DROP COLUMN "user_id",
ADD COLUMN     "applicant_id" TEXT NOT NULL;

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
