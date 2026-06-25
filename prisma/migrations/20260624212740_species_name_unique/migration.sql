/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `species` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "species_name_key" ON "species"("name");
