import { notFound } from "next/navigation";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { fetchFosterMedical } from "@/app/lib/data/fosters/foster-medical.data";
import { FosterMedical } from "@/components/dashboard/my-foster-animals/foster-medical";

export default async function Page({ params }: PageProps<"/dashboard/my-foster-animals/[animalId]">) {
  const { animalId } = await params;
  return <Authorize permission={AppPermissions.MY_FOSTER_ANIMALS_READ} fallback={<StatusPage type="accessDenied" />}>
    <Content animalId={animalId} />
  </Authorize>;
}

async function Content({ animalId }: { animalId: string }) {
  const [data, canCare] = await Promise.all([fetchFosterMedical(animalId), hasPermission(AppPermissions.MY_FOSTER_ANIMALS_CARE)]);
  if (!data) notFound();
  return <FosterMedical data={data} canCare={canCare} />;
}
