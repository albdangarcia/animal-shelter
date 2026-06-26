/*
  Warnings:

  - Added the required column `primary_color_id` to the `animals` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "animals" ADD COLUMN     "primary_color_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_primary_color_id_fkey" FOREIGN KEY ("primary_color_id") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
