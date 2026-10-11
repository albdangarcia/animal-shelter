import { IDParamType, SearchParamsType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchMedicalControls } from "@/app/lib/data/medical-catalog.data";
import { fetchMedicalHistory } from "@/app/lib/data/animals/medical-entry.data";
import MedicalHistory from "@/components/dashboard/animals/medical/medical-history";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.MEDICAL_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent params={params} searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ params, searchParams }: Props) => {
  const { id: animalId } = await params;
  const { page = "1", kind } = await searchParams;
  const [{ entries, totalPages, names, today }, controls] = await Promise.all([
    fetchMedicalHistory(animalId, Number(page), kind),
    fetchMedicalControls(animalId),
  ]);

  return (
    <MedicalHistory
      entries={entries}
      totalPages={totalPages}
      names={names}
      today={today}
      controls={controls}
    />
  );
};

export default Page;
