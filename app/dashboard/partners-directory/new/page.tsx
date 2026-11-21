import PartnerForm from "@/components/dashboard/partners-directory/partner-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

const Page = async ({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) => {
  const { returnTo } = await searchParams;
  return (
    <Authorize
      permission={AppPermissions.PARTNERS_MANAGE}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent returnTo={returnTo} />
    </Authorize>
  );
};

const PageContent = async ({ returnTo }: { returnTo?: string }) => {
  const help = await getHelpLinkGuide(PAGE_HELP_GUIDES.partnerNew);

  return (
    <main>
      <div className="mx-auto mb-2 flex w-full max-w-3xl justify-end">
        <HelpLink guide={help} />
      </div>
      <PartnerForm returnTo={returnTo} />
    </main>
  );
};

export default Page;
