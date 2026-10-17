import type { OutcomeMedicalDetails } from "@/app/lib/zod-schemas/outcome-medical.schemas";

/** Flat, normalized clinical facts for persistence and event snapshots.
 * The owning outcome supplies the day; its transaction supplies the actor.
 * Ordinary-care value types keep their existing required source. */
export function outcomeMedicalValues(details: OutcomeMedicalDetails) {
  if (details.kind === "EUTHANASIA") {
    return { ...details, administeredById: null };
  }
  return {
    kind: details.kind,
    source: null,
    vetPartnerId: null,
    vetName: null,
    administeredById: null,
    circumstances: details.circumstances,
    circumstanceNotes: details.circumstanceNotes,
    cause: details.cause,
    necropsyRequested: details.necropsyRequested,
    bodyDisposition: details.bodyDisposition,
  };
}

export type OutcomeMedicalValues = ReturnType<typeof outcomeMedicalValues>;
