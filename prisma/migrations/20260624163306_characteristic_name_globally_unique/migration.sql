/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `characteristics` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "characteristics_name_category_key";

-- CreateIndex
CREATE UNIQUE INDEX "characteristics_name_key" ON "characteristics"("name");
