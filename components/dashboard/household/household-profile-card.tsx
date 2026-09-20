import Link from "next/link";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HouseholdProfileWithEditorPayload } from "@/app/lib/types";
import { formatDateToLongString, formatTimeAgo } from "@/app/lib/utils/date-utils";
import { HouseholdReadOnlyRows } from "./household-read-only";

export const HouseholdProfileCard = ({
  householdProfile,
  personId,
  canManage,
}: {
  householdProfile?: HouseholdProfileWithEditorPayload | null;
  personId: string;
  canManage: boolean;
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Household & Lifestyle</CardTitle>
        <CardDescription>
          Home environment and animal experience.
        </CardDescription>
        {canManage && (
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/people-directory/${personId}/household/edit`}>
                {householdProfile ? "Edit Household Info" : "Add Household Info"}
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <HouseholdReadOnlyRows hp={householdProfile} />
        {householdProfile?.lastEditedAt && (
          <p className="mt-4 text-xs text-muted-foreground">
            Last edited
            {householdProfile.lastEditedBy
              ? ` by ${householdProfile.lastEditedBy.name}`
              : ""}{" "}
            on {formatDateToLongString(householdProfile.lastEditedAt)} (
            {formatTimeAgo(householdProfile.lastEditedAt)}).
          </p>
        )}
      </CardContent>
    </Card>
  );
};
