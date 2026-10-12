import type { MedicalBatchAnimalRefusal } from "@/app/lib/services/medical-batch";

/** Each animal a batch was refused for, and why. Nothing was saved. */
export function BatchRefusals({
  refusals,
  labelOf = (refusal) => refusal.animalName,
}: {
  refusals: MedicalBatchAnimalRefusal[];
  /** How the form names the refused animal, so two of one name differ. */
  labelOf?: (refusal: MedicalBatchAnimalRefusal) => string;
}) {
  if (refusals.length === 0) return null;
  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-destructive/50 p-3 text-sm"
    >
      <p className="font-medium text-destructive">
        Nothing was saved. Fix or unpick{" "}
        {refusals.length === 1 ? "this animal" : "these animals"}, then try
        again:
      </p>
      <ul className="ml-4 list-disc space-y-1">
        {refusals.map((refusal) => (
          <li key={refusal.entryId ?? refusal.animalId}>
            <span className="font-medium">{labelOf(refusal)}</span>:{" "}
            {refusal.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
