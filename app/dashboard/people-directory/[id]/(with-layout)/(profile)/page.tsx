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

  const hp = person.householdProfile;

  const boolDisplay = (val: boolean | null | undefined) => {
    if (val === null || val === undefined) return "N/A";
    return val ? "Yes" : "No";
  };

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
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
      <Card>
        <CardHeader>
          <CardTitle>Household & Lifestyle</CardTitle>
          <CardDescription>Home environment and animal experience.</CardDescription>
        </CardHeader>
        <CardContent>
          {!hp ? (
            <p className="text-sm text-muted-foreground italic">
              No household information on file.
            </p>
          ) : (
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
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Landlord Permission</span>
                <span>{boolDisplay(hp.landlordPermission)}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Has Children</span>
                <span>{boolDisplay(hp.hasChildren)}</span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Children Ages</span>
                <span>
                  {hp.childrenAges.length > 0
                    ? hp.childrenAges.join(", ")
                    : "N/A"}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Page;
