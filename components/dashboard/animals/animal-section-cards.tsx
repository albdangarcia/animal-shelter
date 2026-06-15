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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AnimalSectionCardPayload, IDParamType } from "@/app/lib/types";
import { fetchSectionCardsAnimalData } from "@/app/lib/data/animals/animal.data";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnimalListingStatus, Sex } from "@prisma/client";
import { calculateAgeString, formatTimeAgo } from "@/app/lib/utils/date-utils";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import {
  Calendar,
  MapPin,
  AlertCircle,
  Heart,
  CheckCircle2,
} from "lucide-react";
import Image from "next/image";

interface Props {
  params: IDParamType;
}

const AnimalSectionCards = async ({ params }: Props) => {
  const { id } = await params;

  const animal: AnimalSectionCardPayload | null =
    await fetchSectionCardsAnimalData(id);
  if (!animal) {
    notFound();
  }

  const daysSinceIntake = animal.intake?.[0]?.intakeDate
    ? formatTimeAgo(animal.intake[0].intakeDate)
    : null;

  const firstImage = animal.animalImages?.[0]?.url;
  const likesCount = animal._count.likes;
  const pendingTasksCount = animal._count.tasks;

  const applicationCount = animal.adoptionApplications?.length || 0;
  const approvedApplications =
    animal.adoptionApplications?.filter((a) => a.status === "APPROVED")
      .length || 0;

  // Health status info for rendering
  const getHealthStatusBadge = () => {
    if (!animal.healthStatus || animal.healthStatus === "HEALTHY") return null;

    const statusConfig = {
      AWAITING_VET_EXAM: { variant: "secondary", label: "Awaiting Vet Exam" },
      AWAITING_TRIAGE: { variant: "secondary", label: "Awaiting Triage" },
      UNDER_VET_CARE: { variant: "destructive", label: "Under Vet Care" },
      HOSPITALISED: { variant: "destructive", label: "Hospitalized" },
      AWAITING_SPAY_NEUTER: {
        variant: "secondary",
        label: "Awaiting Spay/Neuter",
      },
      AWAITING_OTHER_SURGERY: {
        variant: "secondary",
        label: "Awaiting Other Surgery",
      },
      RECOVERING_FROM_SURGERY: {
        variant: "secondary",
        label: "Recovering from Surgery",
      },
    };

    const config = statusConfig[animal.healthStatus];
    return config ? (
      <Alert className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <span className="font-medium text-foreground">{config.label}</span>
        </AlertDescription>
      </Alert>
    ) : null;
  };

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
      {/* Primary Card - Animal Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="mb-1">{animal.name}</CardTitle>
              <CardDescription>
                {animal.breeds.map((breed) => breed.name).join(" • ")}
              </CardDescription>
              {animal.city && animal.state && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
                  <MapPin className="h-3 w-3" />
                  <span>
                    {animal.city}, {animal.state}
                  </span>
                </div>
              )}
            </div>
            <CardAction>
              <Badge variant="outline">
                {formatSingleEnumOption(animal.listingStatus)}
              </Badge>
            </CardAction>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Image and Quick Stats Grid */}
          <div className="flex gap-4">
            <div className="relative flex h-28 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-secondary">
              {firstImage ? (
                <Image
                  src={firstImage}
                  alt={`Photo of ${animal.name}`}
                  fill
                  sizes="112px"
                  className="object-cover"
                  loading="eager"
                />
              ) : (
                <span className="text-4xl">🐾</span>
              )}
            </div>

            <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md p-2.5">
                <p className="text-xs text-muted-foreground mb-0.5">Species</p>
                <p className="font-semibold">{animal.species.name}</p>
              </div>
              <div className="rounded-md p-2.5">
                <p className="text-xs text-muted-foreground mb-0.5">Age</p>
                <p className="font-semibold">
                  {calculateAgeString({ birthDate: animal.birthDate })}
                </p>
              </div>
              <div className="rounded-md p-2.5">
                <p className="text-xs text-muted-foreground mb-0.5">Sex</p>
                <p className="font-semibold">
                  {formatSingleEnumOption(animal.sex)}
                </p>
              </div>
              <div className="rounded-md p-2.5">
                <p className="text-xs text-muted-foreground mb-0.5">Size</p>
                <p className="font-semibold">
                  {formatSingleEnumOption(animal.size)}
                </p>
              </div>
            </div>
          </div>

          {/* Health Status Alert */}
          {getHealthStatusBadge()}

          {/* Quick Stats Row */}
          <div className="flex items-center gap-4 border-t pt-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Heart className="h-4 w-4 text-red-500" />
              <span className="font-medium">{likesCount}</span>
              <span className="text-muted-foreground">likes</span>
            </div>
            {daysSinceIntake && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-500" />
                <span className="text-muted-foreground">
                  In care {daysSinceIntake}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-green-600">
                {applicationCount}
              </span>
              <span className="text-muted-foreground">
                application{applicationCount > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Action Button */}
          <Button asChild className="w-full">
            <Link
              href={
                animal.listingStatus !== AnimalListingStatus.ARCHIVED
                  ? `/dashboard/outcomes/create?animalId=${animal.id}`
                  : `/dashboard/animals/${animal.id}/intake/create`
              }
            >
              {approvedApplications > 0
                ? "Complete Adoption"
                : animal.listingStatus === AnimalListingStatus.ARCHIVED
                ? "Create Intake"
                : "Create Outcome"}
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Secondary Card - Detailed Information */}
      <Card>
        <CardHeader>
          <CardTitle>Details & Medical</CardTitle>
          <CardDescription>
            Medical and identification information
          </CardDescription>
          <CardAction>
            <Button asChild size="sm">
              <Link href={`/dashboard/animals/${animal.id}/edit`}>
                Edit Profile
              </Link>
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Medical Information */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">
              Medical Information
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Spayed/Neutered</span>
                <span className="font-medium text-foreground">
                  {animal.sex !== Sex.UNKNOWN ? (
                    animal.isSpayedNeutered ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" /> Yes
                      </span>
                    ) : (
                      <span>No</span>
                    )
                  ) : (
                    <span>N/A</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Health Status</span>
                <span className="font-medium capitalize">
                  {formatSingleEnumOption(animal.healthStatus) === "N/A"
                    ? "Healthy"
                    : formatSingleEnumOption(animal.healthStatus)}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Legal Status</span>
                <span className="font-medium">
                  {animal.legalStatus === "NONE" || !animal.legalStatus
                    ? "Clear"
                    : formatSingleEnumOption(animal.legalStatus)}
                </span>
              </div>
            </div>
          </div>

          {/* Identification */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">
              Identification
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Microchip</span>
                <span className="font-mono text-xs font-medium">
                  {animal.microchipNumber || "Not microchipped"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="text-muted-foreground">Primary Color</span>
                <span className="font-medium">
                  {animal.colors[0]?.name || "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Pending Tasks Alert */}
          {pendingTasksCount > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium text-foreground">
                  {pendingTasksCount} pending task
                  {pendingTasksCount > 1 ? "s" : ""}
                </span>
                <p className="text-xs text-muted-foreground mt-1">
                  Review tasks tab for items requiring attention
                </p>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AnimalSectionCards;
