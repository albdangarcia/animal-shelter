import type { TransactionClient } from "@/app/lib/prisma";
import {
  AnimalListingStatus,
  type OutcomeType,
} from "@/prisma/generated/enums";
import { isDeathOutcome, type DeathOutcome } from "@/app/lib/utils/death-outcome";

/**
 * The outcome that archived an animal, or null when the animal is not
 * archived. Reversing an outcome reads it to decide whether to restore the
 * listing, and a re-intake reads it to refuse an animal that died, so both
 * agree on which outcome that is.
 *
 * Only an outcome archives an animal, and an archived animal can't be given
 * another. So while the animal is archived, the outcome that archived it is
 * the live one recorded last. A re-intake or a reversal of this outcome is
 * the only way back out: a foster placement refuses an archived animal
 * (`recordFosterPlacement`).
 *
 * Recorded last, and since the timeline gate's listing check
 * (`evaluateListingAgreement`) also dated last: an outcome that archives the
 * animal must come after every other intake and outcome. Rows written before
 * that check can still hold an archiving outcome dated before a later stay
 * (one recorded on a day a reversal left open, say), and the day order would
 * then name an outcome from a stay the animal came back from. The order
 * recorded is right for those too.
 *
 * Has no `next/*` and no auth imports, so a plain `node:test` can drive it.
 * A caller that acts on the answer reads it behind `lockAnimal`.
 */
export const findArchivingOutcome = async (
  db: TransactionClient,
  animalId: string,
): Promise<{ id: string; type: OutcomeType } | null> => {
  const animal = await db.animal.findUnique({
    where: { id: animalId },
    select: { listingStatus: true },
  });
  if (animal?.listingStatus !== AnimalListingStatus.ARCHIVED) return null;
  return db.outcome.findFirst({
    where: { animalId, reversedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, type: true },
  });
};

/**
 * The death that archived the animal, or null when it is not archived or
 * left some other way. No re-intake may follow a death: the re-intake service
 * refuses on this, and the animal page and the re-intake page read it to
 * leave the action out.
 *
 * Read from the outcome rather than from `archiveReason`, the copy kept
 * beside the listing status: the schema lets an archived animal have none,
 * and a reversal voids the outcome itself, so a death reversed by mistake
 * stops counting here at once. An animal back in care is never refused for a
 * death in an earlier stay.
 */
export const findStayEndingDeath = async (
  db: TransactionClient,
  animalId: string,
): Promise<DeathOutcome | null> => {
  const archiving = await findArchivingOutcome(db, animalId);
  return archiving && isDeathOutcome(archiving.type) ? archiving.type : null;
};
