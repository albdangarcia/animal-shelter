import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchFosterApplicationById } from "@/app/lib/data/fosters/foster-applications.data";
import { FosterApplicationReview } from "@/components/dashboard/foster-applications/foster-application-review";
import { Button } from "@/components/ui/button";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

interface Props {
  params: Promise<{ applicationId: string }>;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.FOSTERS_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { applicationId } = await params;

  const application = await fetchFosterApplicationById(applicationId);

  if (!application) {
    notFound();
  }

  const [canManage, help] = await Promise.all([
    hasPermission(AppPermissions.FOSTERS_MANAGE),
    getHelpLinkGuide(PAGE_HELP_GUIDES.fosterApplications),
  ]);

  return (
    <main className="container mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost">
          <Link href="/dashboard/foster-applications">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Foster Applications
          </Link>
        </Button>
        <HelpLink guide={help} />
      </div>

      <FosterApplicationReview application={application} canManage={canManage} />
    </main>
  );
};

export default Page;
