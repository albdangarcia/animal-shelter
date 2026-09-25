import type { AnimalSize } from "@/prisma/generated/enums";

// Shared by create and update — the "" -> null conversion for every nullable
// column either action writes. Not every field applies to both actions
// (sourcePartnerId/surrenderingPersonId only exist on AnimalEditFormInput's
// counterpart, CreateAnimalFormInput); unused fields just come through as
// undefined -> null, which is harmless since the caller never reads them.
export const toAnimalData = (data: {
  size?: AnimalSize | "";
  currentUnitId?: string;
  sourcePartnerId?: string;
  surrenderingPersonId?: string;
  foundAddress?: string;
  foundCity?: string;
  foundState?: string;
  notes?: string;
  microchipNumber?: string;
  isSpayedNeutered: boolean;
  description?: string;
}) => ({
  size: data.size || null,
  currentUnitId: data.currentUnitId || null,
  sourcePartnerId: data.sourcePartnerId || null,
  surrenderingPersonId: data.surrenderingPersonId || null,
  foundAddress: data.foundAddress || null,
  foundCity: data.foundCity || null,
  foundState: data.foundState || null,
  notes: data.notes || null,
  microchipNumber: data.microchipNumber || null,
  // Non-nullable with a default — no "" -> null treatment, unlike the fields
  // above; passed straight through.
  isSpayedNeutered: data.isSpayedNeutered,
  description: data.description || null,
});
