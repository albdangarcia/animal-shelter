import { IDParamType } from "@/app/lib/types";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import {
  fetchAnimalDocuments,
  fetchDocumentFormChoices,
} from "@/app/lib/data/animals/medical-document.data";
import MedicalDocuments from "@/components/dashboard/animals/medical/medical-documents";

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
  const { type } = await searchParams;
  // Uploading, correcting and voiding are for staff who manage medical care;
  // removing a voided document's file is an admin's.
  const [canManage, canRemoveFile] = await Promise.all([
    hasPermission(AppPermissions.MEDICAL_MANAGE),
    hasPermission(AppPermissions.MEDICAL_SETTINGS_MANAGE),
  ]);
  const [page, choices] = await Promise.all([
    fetchAnimalDocuments(animalId, type),
    canManage ? fetchDocumentFormChoices(animalId) : null,
  ]);

  return (
    <MedicalDocuments
      animalId={animalId}
      page={page}
      choices={choices}
      canRemoveFile={canRemoveFile}
    />
  );
};

export default Page;
