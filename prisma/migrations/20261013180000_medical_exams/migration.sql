-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('INTAKE', 'VET', 'RECHECK', 'PRE_ADOPTION');

-- CreateEnum
CREATE TYPE "ExamResult" AS ENUM ('NO_CONCERNS', 'NEEDS_TREATMENT', 'NEEDS_VET_REVIEW');

-- CreateEnum
CREATE TYPE "ExamFindingStatus" AS ENUM ('NORMAL', 'ABNORMAL', 'NOT_EXAMINED');

-- CreateEnum
CREATE TYPE "ReproductiveStatus" AS ENUM ('INTACT', 'ALTERED', 'UNDETERMINED');

-- AlterEnum
ALTER TYPE "MedicalEntryKind" ADD VALUE 'EXAM';

-- AlterTable
ALTER TABLE "medical_entries" ADD COLUMN     "exam_type" "ExamType";

-- AlterTable
ALTER TABLE "surgery_details" ADD COLUMN     "found_on_exam_id" TEXT;

-- CreateTable
CREATE TABLE "exam_details" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "overall_result" "ExamResult" NOT NULL,
    "reproductive_status" "ReproductiveStatus",
    "vitals_log_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_findings" (
    "id" TEXT NOT NULL,
    "exam_details_id" TEXT NOT NULL,
    "body_system" TEXT NOT NULL,
    "status" "ExamFindingStatus" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_details_entry_id_key" ON "exam_details"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_details_vitals_log_id_key" ON "exam_details"("vitals_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_findings_exam_details_id_body_system_key" ON "exam_findings"("exam_details_id", "body_system");

-- CreateIndex
CREATE UNIQUE INDEX "surgery_details_found_on_exam_id_key" ON "surgery_details"("found_on_exam_id");

-- AddForeignKey
ALTER TABLE "surgery_details" ADD CONSTRAINT "surgery_details_found_on_exam_id_fkey" FOREIGN KEY ("found_on_exam_id") REFERENCES "medical_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_details" ADD CONSTRAINT "exam_details_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "medical_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_details" ADD CONSTRAINT "exam_details_vitals_log_id_fkey" FOREIGN KEY ("vitals_log_id") REFERENCES "vitals_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_findings" ADD CONSTRAINT "exam_findings_exam_details_id_fkey" FOREIGN KEY ("exam_details_id") REFERENCES "exam_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;
