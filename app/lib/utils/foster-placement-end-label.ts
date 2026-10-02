import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import {
  FosterReturnReason,
  type OutcomeType,
} from "@/prisma/generated/enums";

/** The parts of an ended placement its history row describes. */
export interface PlacementEnd {
  returnReason: FosterReturnReason | null;
  outcome: { type: OutcomeType; reversedAt: Date | null } | null;
}

// A placement ended by an outcome recorded while the animal was in foster
// says what the outcome was ("Ended: deceased"), which the reason alone does
// not. It falls back to the reason if the outcome is gone.
//
// Reversing the outcome reopens the placement only when that outcome is what
// archived the animal. One reversed after a later re-intake leaves the
// placement ended and linked to it, so the row says the outcome was reversed
// rather than reading as if it stood.
export const describePlacementEnd = (placement: PlacementEnd) => {
  if (
    placement.returnReason !== FosterReturnReason.ENDED_BY_OUTCOME ||
    !placement.outcome
  ) {
    return formatSingleEnumOption(placement.returnReason);
  }
  const type = formatSingleEnumOption(placement.outcome.type).toLowerCase();
  return placement.outcome.reversedAt
    ? `Ended: ${type} (reversed)`
    : `Ended: ${type}`;
};
