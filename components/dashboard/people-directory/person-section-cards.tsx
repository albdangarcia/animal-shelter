import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PersonSectionCardPayload, IDParamType } from "@/app/lib/types";
import { fetchSectionCardsPersonData } from "@/app/lib/data/people-directory/people-directory.data";
import { notFound } from "next/navigation";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import {
  Mail,
  Phone,
  MapPin,
  User as UserIcon,
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

  const tiles = [
    {
      label: "Applications",
      value: applicationCount,
      icon: ClipboardList,
      color: "text-green-600",
      valueClass: "text-2xl font-bold",
    },
    {
      label: "Animal Events",
      value: intakeOutcomeCount,
      icon: LogIn,
      color: "text-orange-500",
      valueClass: "text-2xl font-bold",
    },
    {
      label: "Role",
      value: person.user
        ? formatSingleEnumOption(person.user.role)
        : "No Account",
      icon: UserIcon,
      color: "text-blue-500",
      valueClass: "font-semibold",
    },
    {
      label: "Email Verified",
      value: person.user ? (person.user.emailVerified ? "Yes" : "No") : "N/A",
      icon: Mail,
      color: "text-purple-500",
      valueClass: "font-semibold",
    },
  ];

  return (
    <div className="@container/person-cards">
      <div className="grid grid-cols-1 gap-4 @[650px]/person-cards:grid-cols-2">
        {/* Primary Card - Person Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="mb-1">{person.name}</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  {person.user ? "Registered User" : "Contact Record"}
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
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary">
                {person.user?.image ? (
                  <Image
                    src={person.user.image}
                    alt={`Photo of ${person.name}`}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : (
                  <span className="text-4xl">👤</span>
                )}
              </div>

              <div className="flex-1 grid grid-cols-1 gap-2 text-sm">
                <div className="rounded-md p-2.5 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                    <p className="font-semibold break-all">
                      {person.email || "N/A"}
                    </p>
                  </div>
                </div>
                <div className="rounded-md p-2.5 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Phone</p>
                    <p className="font-semibold">{person.phone || "N/A"}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right column — stat tiles */}
        <div className="grid grid-cols-2 gap-4 content-start">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <tile.icon className={cn("h-4 w-4", tile.color)} />
                <span className="text-xs text-muted-foreground">{tile.label}</span>
              </div>
              <p className={cn("mt-2", tile.valueClass)}>{tile.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PersonSectionCards;