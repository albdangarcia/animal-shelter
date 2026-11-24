import { SacSpeciesCategory } from "@/prisma/generated/enums";

/**
 * The species Shelter Animals Count reports by, in its own order and words
 * (Intake & Outcome Database VRS 1.2021). Each of the shelter's species is
 * counted under one of them, or under none when it is not reported.
 */
export const SAC_SPECIES_CATEGORY_LABELS: Record<SacSpeciesCategory, string> = {
  [SacSpeciesCategory.CANINE]: "Canines",
  [SacSpeciesCategory.FELINE]: "Felines",
  [SacSpeciesCategory.RABBIT]: "Rabbits",
  [SacSpeciesCategory.EQUINE]: "Equines",
  [SacSpeciesCategory.SMALL_MAMMAL]: "Small mammals",
  [SacSpeciesCategory.FARM_ANIMAL]: "Farm animals",
  [SacSpeciesCategory.BIRD]: "Birds",
  [SacSpeciesCategory.REPTILE_AMPHIBIAN]: "Reptiles and amphibians",
};

export const SAC_SPECIES_CATEGORY_OPTIONS = (
  Object.keys(SAC_SPECIES_CATEGORY_LABELS) as SacSpeciesCategory[]
).map((value) => ({ value, label: SAC_SPECIES_CATEGORY_LABELS[value] }));
