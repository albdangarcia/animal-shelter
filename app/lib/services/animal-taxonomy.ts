import type { TransactionClient } from "@/app/lib/prisma";
import { ConflictError } from "@/app/lib/utils/errors";

/**
 * What keeps a deleted species, breed or color off an animal being added or
 * edited.
 *
 * Settings → Animal Taxonomy soft-deletes them, and the pickers on the animal
 * form leave deleted ones out. A form opened before the delete still offers
 * them, so the save checks again. An animal that already has a deleted breed
 * or color keeps it until someone edits the animal: the edit form leaves the
 * deleted one out, so it has to be replaced to save.
 *
 * No auth or `next/*` imports, so database tests drive it directly.
 */

/** The animal form's field the refusal belongs under. */
export type TaxonomyField = "species" | "breed" | "primaryColor" | "additionalColors";

export class TaxonomyRefusal extends ConflictError {
  constructor(
    public readonly field: TaxonomyField,
    message: string,
  ) {
    super(message);
    this.name = "TaxonomyRefusal";
  }
}

export const SPECIES_UNAVAILABLE =
  "The selected species is no longer available. Please refresh and try again.";
export const BREED_UNAVAILABLE =
  "The selected breed is no longer available for this species. Please refresh and try again.";
export const COLORS_UNAVAILABLE =
  "One or more selected colors are no longer available. Please refresh and try again.";

/**
 * Throws a `TaxonomyRefusal` unless the species, the breed (of that species)
 * and every color exist and aren't deleted.
 */
export const assertLiveTaxonomy = async (
  tx: TransactionClient,
  {
    speciesId,
    breedId,
    primaryColorId,
    additionalColorIds,
  }: {
    speciesId: string;
    breedId: string;
    primaryColorId: string;
    additionalColorIds: string[];
  },
): Promise<void> => {
  const species = await tx.species.findFirst({
    where: { id: speciesId, deletedAt: null },
    select: { id: true },
  });
  if (!species) {
    throw new TaxonomyRefusal("species", SPECIES_UNAVAILABLE);
  }

  const breed = await tx.breed.findFirst({
    where: { id: breedId, speciesId, deletedAt: null },
    select: { id: true },
  });
  if (!breed) {
    throw new TaxonomyRefusal("breed", BREED_UNAVAILABLE);
  }

  const colorIds = Array.from(new Set([primaryColorId, ...additionalColorIds]));
  const liveColors = await tx.color.findMany({
    where: { id: { in: colorIds }, deletedAt: null },
    select: { id: true },
  });
  if (liveColors.length !== colorIds.length) {
    const primaryIsLive = liveColors.some((color) => color.id === primaryColorId);
    throw new TaxonomyRefusal(
      primaryIsLive ? "additionalColors" : "primaryColor",
      COLORS_UNAVAILABLE,
    );
  }
};
