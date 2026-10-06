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
// rather than reading as if it stood. That holds for the foster adopting too
// ("Adopted By Foster (reversed)"): the placement is ended as
// ADOPTED_BY_FOSTER and linked to the adoption.
//
// No other reason gets the marker. A placement a reversal reopened keeps its
// link to the reversed outcome, and a later plain return leaves it there, so
// "Returned To Shelter" with a reversed outcome linked is not itself reversed.
export const describePlacementEnd = (placement: PlacementEnd) => {
  const { returnReason, outcome } = placement;
  if (returnReason === FosterReturnReason.ADOPTED_BY_FOSTER) {
    const reason = formatSingleEnumOption(returnReason);
    return outcome?.reversedAt ? `${reason} (reversed)` : reason;
  }
  if (returnReason !== FosterReturnReason.ENDED_BY_OUTCOME || !outcome) {
    return formatSingleEnumOption(returnReason);
  }
  const type = formatSingleEnumOption(outcome.type).toLowerCase();
  return outcome.reversedAt ? `Ended: ${type} (reversed)` : `Ended: ${type}`;
};
