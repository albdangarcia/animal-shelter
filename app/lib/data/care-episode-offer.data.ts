import prisma from "@/app/lib/prisma";
import type { CareEpisodeOffer } from "@/app/lib/services/care-episode";
import { findActiveVetClinics } from "@/app/lib/data/medical-catalog";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

/**
 * A care-episode offer after a move, with what its dialog's form needs: the
 * shelter's today (the day it opens or closes on, and the latest it can
 * pick) and, to open one, the vet clinics the form offers if the kind of care
 * is changed.
 */
export type CareEpisodeOfferPrompt = CareEpisodeOffer & {
  today: CalendarDay;
  vetClinics: { id: string; name: string }[];
};

/** The offer with its form's choices, read only when there is an offer. */
export const careEpisodeOfferPrompt = async (
  offer: CareEpisodeOffer | null,
): Promise<CareEpisodeOfferPrompt | null> =>
  offer && {
    ...offer,
    today: await getShelterToday(),
    vetClinics: offer.kind === "OPEN" ? await findActiveVetClinics(prisma) : [],
  };
