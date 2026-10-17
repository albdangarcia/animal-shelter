-- CreateEnum
CREATE TYPE "MicrochipRegistrationStatus" AS ENUM ('UNKNOWN', 'NOT_REGISTERED', 'PENDING', 'REGISTERED');

-- AlterTable
ALTER TABLE "vaccine_details" ADD COLUMN     "veterinarian_license_number" TEXT,
ADD COLUMN     "veterinarian_name" TEXT;

-- AlterTable
ALTER TABLE "microchip_details" ADD COLUMN     "registration_date" TEXT,
ADD COLUMN     "registration_notes" TEXT,
ADD COLUMN     "registration_status" "MicrochipRegistrationStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "registry_name" TEXT;

