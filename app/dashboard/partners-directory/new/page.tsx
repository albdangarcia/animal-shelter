import PartnerForm from "@/components/dashboard/partners-directory/partner-form";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";

const Page = async () => {
  return (
    <Authorize
      permission={AppPermissions.PARTNERS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <main>
        <PartnerForm />
      </main>
    </Authorize>
  );
};

export default Page;