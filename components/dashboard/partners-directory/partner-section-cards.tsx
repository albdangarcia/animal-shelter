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
import { cn } from "@/lib/utils";
import { PartnerSectionCardPayload, IDParamType } from "@/app/lib/types";
import { fetchSectionCardsPartnerData } from "@/app/lib/data/partners-directory/partners-directory.data";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerTypesOptions } from "@/components/dashboard/partners-directory/table/partners-directory-options";
import {
  Mail,
  Phone,
  Globe,
  MapPin,
  StickyNote,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  UserStar,
} from "lucide-react";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";

interface Props {
  params: IDParamType;
}

const PartnerSectionCards = async ({ params }: Props) => {
  const { id } = await params;

  const partner: PartnerSectionCardPayload | null =
    await fetchSectionCardsPartnerData(id);

  if (!partner) {
    notFound();
  }

  const canManage = await hasPermission(AppPermissions.PARTNERS_MANAGE);

  const fullAddress = [
    partner.address,
    partner.city,
    partner.state,
    partner.zipCode,
  ]
    .filter(Boolean)
    .join(", ");

  const typeMeta = PartnerTypesOptions.find((t) => t.value === partner.type);
  const primaryContact = partner.contacts[0] ?? null;

  const tiles = [
    {
      label: "Contacts",
      value: partner._count.contacts,
      icon: Users,
      color: "text-blue-500",
    },
    {
      label: "Transfers In",
      value: partner._count.transferredInAnimals,
      icon: ArrowDownLeft,
      color: "text-green-600",
    },
    {
      label: "Transfers Out",
      value: partner._count.transferredOutAnimals,
      icon: ArrowUpRight,
      color: "text-orange-500",
    },
    {
      label: "Notes",
      value: partner._count.partnerNotes,
      icon: FileText,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
      {/* Left column */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="mb-1">{partner.name}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {typeMeta ? (
                  <Badge variant="outline" className={typeMeta.className}>
                    <typeMeta.icon className="mr-1 h-3 w-3" />
                    {typeMeta.label}
                  </Badge>
                ) : null}
              </CardDescription>
            </div>
            <CardAction>
              <span
                className={cn(
                  "inline-block",
                  !canManage && "cursor-not-allowed",
                )}
              >
                <Button
                  asChild
                  size="sm"
                  variant={canManage ? "default" : "outline"}
                  className={cn(!canManage && "pointer-events-none opacity-50")}
                >
                  <Link
                    href={`/dashboard/partners-directory/${partner.id}/edit`}
                    aria-disabled={!canManage}
                    tabIndex={canManage ? undefined : -1}
                  >
                    Edit Partner
                  </Link>
                </Button>
              </span>
            </CardAction>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Status */}
          <div className="flex items-center gap-2">
            <Badge variant={partner.isActive ? "default" : "secondary"}>
              {partner.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>

          {/* Contact info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b pb-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" /> Email
              </span>
              <span className="font-medium break-all">
                {partner.email || "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" /> Phone
              </span>
              <span className="font-medium">{partner.phone || "N/A"}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Globe className="h-4 w-4" /> Website
              </span>
              <span className="font-medium break-all">
                {partner.website ? (
                  <Link
                    href={partner.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {partner.website}
                  </Link>
                ) : (
                  "N/A"
                )}
              </span>
            </div>
            <div className="flex items-start justify-between border-b pb-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" /> Address
              </span>
              <span className="font-medium text-right">
                {fullAddress || "N/A"}
              </span>
            </div>
          </div>

          {/* Primary contact — who to call */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserStar className="h-4 w-4" /> Primary Contact
            </h4>
            {primaryContact ? (
              <div className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Link
                    href={`/dashboard/people-directory/${primaryContact.person.id}`}
                    className="font-medium hover:underline"
                  >
                    {primaryContact.person.name}
                  </Link>
                  {primaryContact.role ? (
                    <span className="text-xs text-muted-foreground">
                      {primaryContact.role}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {primaryContact.person.email ? (
                    <p className="break-all">{primaryContact.person.email}</p>
                  ) : null}
                  {primaryContact.person.phone ? (
                    <p>{primaryContact.person.phone}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No primary contact set.
              </p>
            )}
          </div>

          {/* Pinned note */}
          {partner.notes ? (
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <StickyNote className="h-4 w-4" /> Quick Note
              </h4>
              <p className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {partner.notes}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Right column */}
      <div className="grid grid-cols-2 gap-4 content-start">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <tile.icon className={cn("h-4 w-4", tile.color)} />
              <span className="text-xs text-muted-foreground">
                {tile.label}
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold">{tile.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PartnerSectionCards;
