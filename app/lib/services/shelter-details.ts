import type { TransactionClient } from "@/app/lib/prisma";
import { PreconditionFailedError } from "@/app/lib/utils/errors";
import {
  isUsStateCode,
  SHELTER_STATE_MESSAGE,
} from "@/app/lib/utils/shelter-settings";
import { lockShelterSettingsRow } from "@/app/lib/services/shelter-settings-row";

/** A refusal that belongs to one field of the shelter details form. */
export class ShelterDetailsRefusal extends PreconditionFailedError {
  readonly field: "state";

  constructor(message: string, field: "state") {
    super(message);
    this.name = "ShelterDetailsRefusal";
    this.field = field;
  }
}

/**
 * Saves the US state the shelter is in, as its two-letter code. A transfer
 * from or to a partner is in state, out of state or international against
 * it. Once set it can be changed but not cleared: no state only means no one
 * has set it yet.
 *
 * The settings row may not exist yet, so saving creates it from the
 * fallbacks (see `lockShelterSettingsRow`).
 *
 * This module has **no `next/*` and no auth imports**, so a plain `node:test`
 * can drive it. It runs inside the caller's `prisma.$transaction`.
 */
export const updateShelterState = async (
  tx: TransactionClient,
  state: string,
): Promise<string> => {
  if (!isUsStateCode(state)) {
    throw new ShelterDetailsRefusal(SHELTER_STATE_MESSAGE, "state");
  }
  await lockShelterSettingsRow(tx);
  await tx.shelterSettings.update({ where: { id: "shelter" }, data: { state } });
  return state;
};
