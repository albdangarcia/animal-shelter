import { IDParamType } from "@/app/lib/types";
import { fetchPartnerAnimalHistory } from "@/app/lib/data/partners-directory/partner-animal-history.data";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import PartnerAnimalHistory from "@/components/dashboard/partners-directory/animal-history/partner-animal-history";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PARTNERS_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: partnerId } = await params;

  const [{ history }, help] = await Promise.all([
    fetchPartnerAnimalHistory(partnerId),
    getHelpLinkGuide(PAGE_HELP_GUIDES.partnerHistory),
  ]);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <HelpLink guide={help} />
      </div>
      <PartnerAnimalHistory history={history} />
    </div>
  );
};

export default Page;