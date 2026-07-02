-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('KENNEL', 'ISOLATION', 'MEDICAL', 'QUARANTINE', 'FOSTER', 'OFFSITE', 'OTHER');

-- AlterTable
ALTER TABLE "animals" ADD COLUMN     "current_unit_id" TEXT;

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("name");

-- CreateIndex
CREATE INDEX "units_location_id_idx" ON "units"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_name_location_id_key" ON "units"("name", "location_id");

-- CreateIndex
CREATE INDEX "animals_current_unit_id_idx" ON "animals"("current_unit_id");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_current_unit_id_fkey" FOREIGN KEY ("current_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
