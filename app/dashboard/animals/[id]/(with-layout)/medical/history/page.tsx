import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { fetchMedicalControls } from "@/app/lib/data/medical-catalog.data";
import { fetchMedicalHistory } from "@/app/lib/data/animals/medical-entry.data";
import MedicalHistory from "@/components/dashboard/animals/medical/medical-history";

interface Props {
  params: IDParamType;
  // A param given more than once arrives as a list.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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
  const { page, kind } = await searchParams;
  // One page is shown: of a repeated `page`, the first. Every `kind` counts.
  const pageNumber = Number([page ?? "1"].flat()[0]);
  const [{ entries, totalPages, names, today }, controls] = await Promise.all([
    fetchMedicalHistory(animalId, pageNumber, kind),
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
