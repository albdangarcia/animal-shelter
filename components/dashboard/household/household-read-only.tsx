import { HouseholdProfilePayload } from "@/app/lib/types";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { isRenting } from "@/app/lib/zod-schemas/household-profile.schemas";

export const boolDisplay = (val: boolean | null | undefined) => {
  if (val === null || val === undefined) return "N/A";
  return val ? "Yes" : "No";
};

export const HouseholdReadOnlyRows = ({
  hp,
}: {
  hp: HouseholdProfilePayload | null | undefined;
}) => {
  if (!hp) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No household information on file.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Living Situation</span>
        <span>{formatSingleEnumOption(hp.livingSituation)}</span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Household Size</span>
        <span>{hp.householdSize ?? "N/A"}</span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Has Yard</span>
        <span>{boolDisplay(hp.hasYard)}</span>
      </div>
      {/* Null here now means "not renting", not "unanswered" — the row is
          hidden rather than showing a meaningless N/A. */}
      {isRenting(hp.livingSituation) && (
        <div className="flex items-center justify-between border-b pb-2 text-sm">
          <span className="text-muted-foreground">Landlord Permission</span>
          <span>{boolDisplay(hp.landlordPermission)}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Has Children</span>
        <span>{boolDisplay(hp.hasChildren)}</span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Children Ages</span>
        <span>
          {hp.childrenAges.length > 0 ? hp.childrenAges.join(", ") : "N/A"}
        </span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Other Animals</span>
        <span>{hp.otherAnimalsDescription || "N/A"}</span>
      </div>
      <div className="flex items-center justify-between border-b pb-2 text-sm">
        <span className="text-muted-foreground">Animal Experience</span>
        <span>{hp.animalExperience || "N/A"}</span>
      </div>
    </div>
  );
};
