-- CreateEnum
CREATE TYPE "SacSpeciesCategory" AS ENUM ('CANINE', 'FELINE', 'RABBIT', 'EQUINE', 'SMALL_MAMMAL', 'FARM_ANIMAL', 'BIRD', 'REPTILE_AMPHIBIAN');

-- AlterTable
ALTER TABLE "species" ADD COLUMN     "sac_category" "SacSpeciesCategory";
