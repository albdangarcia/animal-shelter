import { IDParamType } from "@/app/lib/types";
import { fetchPartnerAnimalHistory } from "@/app/lib/data/partners-directory/partner-animal-history.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import PartnerAnimalHistory from "@/components/dashboard/partners-directory/animal-history/partner-animal-history";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PARTNERS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: partnerId } = await params;

  const { history } = await fetchPartnerAnimalHistory(partnerId);

  return <PartnerAnimalHistory history={history} />;
};

export default Page;