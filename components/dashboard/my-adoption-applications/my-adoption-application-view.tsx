import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MyAdoptionApplicationDetailPayload } from "@/app/lib/types";
import { formatDateOrNA } from "@/app/lib/utils/date-utils";
import { HouseholdReadOnlyRows } from "@/components/dashboard/household/household-read-only";
import { StatusHistoryTimeline } from "@/components/dashboard/applications/status-history-timeline";
import { ApplicationStatuses } from "./table/my-applications-options";
import { MyApplicationActions } from "./my-application-actions";
import { MyApplicationStatusMessage } from "./my-application-status-message";

const ReadOnlyRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) => (
  <div className="flex items-center justify-between gap-4 border-b pb-2 text-sm">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="text-right">{value || "N/A"}</span>
  </div>
);

/**
 * The applicant's read-only view of one adoption application, reachable at
 * every status — the edit form is not, and used to be the only way in, so at
 * the other seven statuses the applicant simply lost sight of everything they
 * had submitted.
 *
 * `HouseholdReadOnlyRows` takes the application itself: an adoption
 * application carries the same eight household columns a `HouseholdProfile`
 * does (they are written by the shared `toHouseholdData` mapper), so the
 * applicant and foster views render household answers identically.
 */
export const MyAdoptionApplicationView = ({
  application,
}: {
  application: MyAdoptionApplicationDetailPayload;
}) => {
  const statusMeta = ApplicationStatuses.find(
    (s) => s.value === application.status,
  );
  const animal = application.animal;
  const breeds = animal.breeds.map((b) => b.name).join(", ");

  const addressLines = [
    application.applicantAddressLine1,
    application.applicantAddressLine2,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-8">
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="@[650px]/card:text-xl flex flex-wrap items-center gap-2">
            Adoption Application for {animal.name}
            {statusMeta && (
              <Badge variant="outline" className="flex w-fit items-center">
                {statusMeta.icon && (
                  <statusMeta.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                )}
                {statusMeta.label}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {[breeds || "Mixed Breed", animal.species.name]
              .filter(Boolean)
              .join(" · ")}{" "}
            &bull; Submitted {formatDateOrNA(application.submittedAt)}.
          </CardDescription>
          <CardAction>
            <MyApplicationActions
              applicationId={application.id}
              status={application.status}
              animalName={animal.name}
              animalListingStatus={animal.listingStatus}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <MyApplicationStatusMessage status={application.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Details</CardTitle>
          <CardDescription>
            The contact details you submitted with this application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <ReadOnlyRow label="Full Name" value={application.applicantName} />
            <ReadOnlyRow label="Email" value={application.applicantEmail} />
            <ReadOnlyRow label="Phone" value={application.applicantPhone} />
            <ReadOnlyRow label="Address" value={addressLines} />
            <ReadOnlyRow label="City" value={application.applicantCity} />
            <ReadOnlyRow label="State" value={application.applicantState} />
            <ReadOnlyRow
              label="ZIP Code"
              value={application.applicantZipCode}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Household &amp; Lifestyle</CardTitle>
        </CardHeader>
        <CardContent>
          <HouseholdReadOnlyRows hp={application} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reason for Adoption</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-line">
            {application.reasonForAdoption}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status History</CardTitle>
          <CardDescription>
            Every change to this application, and the reason the shelter
            recorded for it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusHistoryTimeline history={application.history} />
        </CardContent>
      </Card>
    </div>
  );
};
