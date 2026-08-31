import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchPersonProfileTabData } from "@/app/lib/data/people-directory/people-directory.data";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { notFound } from "next/navigation";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import HouseholdProfileForm from "@/components/dashboard/account/household-profile-form";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id } = await params;

  const [person, canManage] = await Promise.all([
    fetchPersonProfileTabData(id),
    hasPermission(AppPermissions.PERSONS_MANAGE),
  ]);

  if (!person) {
    notFound();
  }

  const hasAccount = !!person.user;
  const householdMode = !hasAccount && canManage ? "staff-edit" : "staff-view";

  return (
    <div className="@container/profile-cards">
      <div className="grid grid-cols-1 gap-4 @[700px]/profile-cards:grid-cols-2">
        {/* Card 1 — Contact & Account Details */}
        <Card>
          <CardHeader>
            <CardTitle>Contact & Account Details</CardTitle>
            <CardDescription>Address and login account information.</CardDescription>
            {canManage && (
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/people-directory/${id}/edit`}>
                    Edit Contact Info
                  </Link>
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Address
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between border-b pb-2 text-sm">
                  <span className="text-muted-foreground">Street</span>
                  <span>{person.address || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between border-b pb-2 text-sm">
                  <span className="text-muted-foreground">City</span>
                  <span>{person.city || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between border-b pb-2 text-sm">
                  <span className="text-muted-foreground">State</span>
                  <span>{person.state || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between border-b pb-2 text-sm">
                  <span className="text-muted-foreground">Zip Code</span>
                  <span>{person.zipCode || "N/A"}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Account Information
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between border-b pb-2 text-sm">
                  <span className="text-muted-foreground">Login Account</span>
                  <span>{person.user ? "Yes" : "No"}</span>
                </div>
                {person.user && (
                  <>
                    <div className="flex items-center justify-between border-b pb-2 text-sm">
                      <span className="text-muted-foreground">Role</span>
                      <span>{formatSingleEnumOption(person.user.role)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b pb-2 text-sm">
                      <span className="text-muted-foreground">Email Verified</span>
                      <span>{person.user.emailVerified ? "Yes" : "No"}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2 — Household & Lifestyle */}
        <HouseholdProfileForm
          householdProfile={person.householdProfile}
          mode={householdMode}
          personId={person.id}
          canManage={canManage}
        />
      </div>
    </div>
  );
};

export default Page;