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
import { HouseholdProfilePayload } from "@/app/lib/types";
import { HouseholdReadOnlyRows } from "./household-read-only";

export const HouseholdProfileCard = ({
  householdProfile,
  personId,
  canManage,
  hasAccount,
}: {
  householdProfile?: HouseholdProfilePayload | null;
  personId: string;
  canManage: boolean;
  hasAccount: boolean;
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Household & Lifestyle</CardTitle>
        <CardDescription>
          Home environment and animal experience.
        </CardDescription>
        {canManage && !hasAccount && (
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
      </CardContent>
    </Card>
  );
};
