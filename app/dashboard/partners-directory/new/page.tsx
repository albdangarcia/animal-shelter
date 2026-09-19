import PartnerForm from "@/components/dashboard/partners-directory/partner-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";

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
      <main>
        <PartnerForm returnTo={returnTo} />
      </main>
    </Authorize>
  );
};

export default Page;