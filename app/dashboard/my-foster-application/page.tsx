import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { ApplicationStatus } from "@/prisma/generated/enums";
import {
  fetchMyFosterApplication,
  FosterApplicantDefaultsPayload,
} from "@/app/lib/data/fosters/my-foster-application.data";
import { fetchSpecies } from "@/app/lib/data/public.data";
import { MyFosterApplicationForm } from "@/components/dashboard/my-foster-application/my-foster-application-form";
import { FosterApplicationStatus } from "@/components/dashboard/my-foster-application/foster-application-status";
import { FosterApprovedNotice } from "@/components/dashboard/my-foster-application/foster-approved-notice";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

const terminalStatuses: ApplicationStatus[] = [
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.REJECTED,
];

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.MY_FOSTER_APPLICATION_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent />
    </Authorize>
  );
};

const PageContent = async () => {
  const [{ application, applicantDefaults, hasActiveFosterProfile }, species, help] =
    await Promise.all([
      fetchMyFosterApplication(),
      fetchSpecies(),
      getHelpLinkGuide(PAGE_HELP_GUIDES.myFosterApplication),
    ]);

  // Every view of this page (form, status, approved notice) gets the same "?".
  const withHelp = (view: ReactNode) => (
    <div className="space-y-2">
      <div className="flex justify-end">
        <HelpLink guide={help} />
      </div>
      {view}
    </div>
  );

  // ACTIVE FosterProfile is the source of truth for "approved foster,"
  // regardless of application status — a staff direct-add can activate one
  // without an APPROVED application row.
  if (hasActiveFosterProfile) {
    return withHelp(<FosterApprovedNotice />);
  }

  if (!application) {
    return withHelp(
      <FosterApplicationFormCard
        applicantDefaults={applicantDefaults}
        species={species}
      />,
    );
  }

  const isTerminal = terminalStatuses.includes(application.status);

  if (!isTerminal) {
    return withHelp(<FosterApplicationStatus application={application} />);
  }

  return withHelp(
    <div className="space-y-8">
      <FosterApplicationStatus application={application} />
      <FosterApplicationFormCard
        applicantDefaults={applicantDefaults}
        species={species}
      />
    </div>,
  );
};

const FosterApplicationFormCard = ({
  applicantDefaults,
  species,
}: {
  applicantDefaults: FosterApplicantDefaultsPayload | null;
  species: { id: string; name: string }[];
}) => (
  <Card className="@container/card">
    <CardHeader>
      <CardTitle className="@[650px]/card:text-xl">
        My foster application
      </CardTitle>
      <CardDescription>
        Submit or track your application to become a foster.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <MyFosterApplicationForm
        applicantDefaults={applicantDefaults}
        species={species}
      />
    </CardContent>
  </Card>
);

export default Page;
