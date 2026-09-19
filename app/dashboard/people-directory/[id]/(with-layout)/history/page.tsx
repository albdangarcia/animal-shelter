import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import PersonAnimalHistory from "@/components/dashboard/people-directory/history/person-animal-history";
import { fetchPersonAnimalHistory } from "@/app/lib/data/people-directory/person-animal-history.data";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} />
    </Authorize>
  );
};

const PageContent = async ({ params }: Props) => {
  const { id: personId } = await params;

  const { history } = await fetchPersonAnimalHistory(personId);

  return <PersonAnimalHistory history={history} />;
};

export default Page;
