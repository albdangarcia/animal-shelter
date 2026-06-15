import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonSectionCardPayload, IDParamType } from "@/app/lib/types";
import { fetchSectionCardsPersonData } from "@/app/lib/data/people-directory/people-directory.data";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonType } from "@prisma/client";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import {
  Mail,
  Phone,
  MapPin,
  Building2,
  User as UserIcon,
  PawPrint,
  ClipboardList,
  LogIn,
} from "lucide-react";
import Image from "next/image";

interface Props {
  params: IDParamType;
}

const PersonSectionCards = async ({ params }: Props) => {
  const { id } = await params;

  const person: PersonSectionCardPayload | null =
    await fetchSectionCardsPersonData(id);
  if (!person) {
    notFound();
  }

  const fullAddress = [
    person.address,
    person.city,
    person.state,
    person.zipCode,
  ]
    .filter(Boolean)
    .join(", ");

  const applicationCount = person._count.adoptionApplications;
  const intakeOutcomeCount =
    person._count.surrenderedAnimals +
    person._count.foundAnimals +
    person._count.reclaimedAnimalsAsOwner;

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
      {/* Primary Card - Person Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="mb-1">{person.name}</CardTitle>
              <CardDescription className="flex items-center gap-1">
                {person.type === PersonType.AGENCY ? (
                  <Building2 className="h-3 w-3" />
                ) : (
                  <UserIcon className="h-3 w-3" />
                )}
                {formatSingleEnumOption(person.type)}
              </CardDescription>
              {fullAddress && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
                  <MapPin className="h-3 w-3" />
                  <span>{fullAddress}</span>
                </div>
              )}
            </div>
            <CardAction>
              <Badge variant={person.user ? "default" : "outline"}>
                {person.user
                  ? formatSingleEnumOption(person.user.role)
                  : "No Account"}
              </Badge>
            </CardAction>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Avatar and Contact Info Grid */}
          <div className="flex gap-4">
            <div className="relative flex h-28 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary">
              {person.user?.image ? (
                <Image
                  src={person.user.image}
                  alt={`Photo of ${person.name}`}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              ) : (
                <span className="text-4xl">
                  {person.type === PersonType.AGENCY ? "🏢" : "👤"}
                </span>
              )}
            </div>

            <div className="flex-1 grid grid-cols-1 gap-2 text-sm">
              <div className="rounded-md p-2.5 flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                  <p className="font-semibold break-all">
                    {person.email || "N/A"}
                  </p>
                </div>
              </div>
              <div className="rounded-md p-2.5 flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Phone</p>
                  <p className="font-semibold">{person.phone || "N/A"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3 border-t pt-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-green-600" />
                <span className="text-xs text-muted-foreground">
                  Applications
                </span>
              </div>

              <p className="mt-2 text-2xl font-bold">{applicationCount}</p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <LogIn className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">
                  Animal Events
                </span>
              </div>

              <p className="mt-2 text-2xl font-bold">{intakeOutcomeCount}</p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Role</span>
              </div>

              <p className="mt-2 font-semibold">
                {person.user
                  ? formatSingleEnumOption(person.user.role)
                  : "No Account"}
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">
                  Email Verified
                </span>
              </div>

              <p className="mt-2 font-semibold">
                {person.user
                  ? person.user.emailVerified
                    ? "Yes"
                    : "No"
                  : "N/A"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary Card - Contact & Account Details */}
      <Card>
        <CardHeader>
          <CardTitle>Contact & Account Details</CardTitle>
          <CardDescription>Address and account information</CardDescription>
          <CardAction>
            <Button asChild size="sm">
              <Link href={`/dashboard/people-directory/${person.id}/edit`}>
                Edit Contact Info
              </Link>
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Address */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">
              Address
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Street</span>
                <span className="font-medium text-foreground">
                  {person.address || "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">City</span>
                <span className="font-medium text-foreground">
                  {person.city || "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">State</span>
                <span className="font-medium text-foreground">
                  {person.state || "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Zip Code</span>
                <span className="font-medium text-foreground">
                  {person.zipCode || "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Account Information */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">
              Account Information
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Login Account</span>
                <span className="font-medium text-foreground">
                  {person.user ? "Yes" : "No"}
                </span>
              </div>
              {person.user && (
                <>
                  <div className="flex items-center justify-between border-b pb-2 text-sm">
                    <span className="text-muted-foreground">Role</span>
                    <span className="font-medium text-foreground">
                      {formatSingleEnumOption(person.user.role)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2 text-sm">
                    <span className="text-muted-foreground">
                      Email Verified
                    </span>
                    <span className="font-medium text-foreground">
                      {person.user.emailVerified ? "Yes" : "No"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PersonSectionCards;
