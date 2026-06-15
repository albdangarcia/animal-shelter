import PersonForm from "@/components/dashboard/people-directory/person-form";
import { Permissions } from "@/app/lib/auth/permissions";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";

const Page = async () => {
  return (
    <Authorize
      permission={Permissions.PERSONS_MANAGE}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <main>
        <PersonForm />
      </main>
    </Authorize>
  );
};

export default Page;