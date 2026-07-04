/*
  Warnings:

  - The values [FOSTER] on the enum `LocationType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LocationType_new" AS ENUM ('KENNEL', 'ISOLATION', 'MEDICAL', 'QUARANTINE', 'OFFSITE', 'OTHER');
ALTER TABLE "locations" ALTER COLUMN "type" TYPE "LocationType_new" USING ("type"::text::"LocationType_new");
ALTER TYPE "LocationType" RENAME TO "LocationType_old";
ALTER TYPE "LocationType_new" RENAME TO "LocationType";
DROP TYPE "LocationType_old";
COMMIT;
