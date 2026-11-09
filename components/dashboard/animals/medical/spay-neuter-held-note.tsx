import Link from "next/link";
import type { SurgeryProcedure } from "@/prisma/generated/enums";
import {
  spayNeuterHeldText,
  type SpayNeuterHeld,
} from "@/app/lib/utils/spay-neuter";

/**
 * Under a surgery picker that leaves spay and neuter out: why, and a link to
 * the animal's surgeries, where the entry holding the place is corrected,
 * rescheduled or voided.
 */
export function SpayNeuterHeldNote({
  animalId,
  heldBy,
  planned,
}: {
  animalId: string;
  heldBy: SpayNeuterHeld & { status: "given" | "scheduled" };
  planned?: SurgeryProcedure | null;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {spayNeuterHeldText(heldBy, planned)}{" "}
      <Link
        href={`/dashboard/animals/${animalId}/medical/history?kind=SURGERY`}
        className="underline"
      >
        See its surgeries
      </Link>
    </p>
  );
}
