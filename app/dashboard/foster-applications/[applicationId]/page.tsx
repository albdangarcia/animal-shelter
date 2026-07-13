import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchFosterApplicationById } from "@/app/lib/data/fosters/foster-applications.data";
import { FosterApplicationReview } from "@/components/dashboard/foster-applications/foster-application-review";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ applicationId: string }>;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.FOSTERS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
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

  const canManage = await hasPermission(AppPermissions.FOSTERS_MANAGE);

  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href="/dashboard/foster-applications">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Foster Applications
        </Link>
      </Button>

      <FosterApplicationReview application={application} canManage={canManage} />
    </main>
  );
};

export default Page;
