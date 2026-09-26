import { Home } from "lucide-react";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";

interface Props {
  animalName: string;
  placement: {
    startDate: string;
    fosterProfile: { person: { name: string } };
  };
  // The foster's identity is gated behind FOSTERS_READ, as on the animal
  // page's foster banner. That the animal is in foster is not.
  canReadFosters: boolean;
}

// Shown above the outcome form while the animal is in foster. Recording the
// outcome ends the placement on the outcome's day, so staff learn that before
// they submit rather than from the foster's profile afterwards.
export function OutcomeFosterNotice({
  animalName,
  placement,
  canReadFosters,
}: Props) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-4xl items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/40">
      <Home className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
      <p className="text-blue-900 dark:text-blue-100">
        {animalName} is in foster with{" "}
        {canReadFosters ? (
          <span className="font-semibold">
            {placement.fosterProfile.person.name}
          </span>
        ) : (
          "a foster"
        )}{" "}
        since {formatShelterDayOrNA(placement.startDate)}. Recording this
        outcome ends that placement.
      </p>
    </div>
  );
}
