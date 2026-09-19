import { IDParamType } from "@/app/lib/types";
import {
  fetchPartnerContacts,
  fetchLinkablePeople,
} from "@/app/lib/data/partners-directory/partner-contacts.data";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import PartnerContacts from "@/components/dashboard/partners-directory/contacts/partner-contacts";

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

  const canManage = await hasPermission(AppPermissions.PARTNERS_MANAGE);

  const { contacts } = await fetchPartnerContacts(partnerId);

  // Only managers can add contacts, so only fetch the linkable list for them.
  const { people } = canManage
    ? await fetchLinkablePeople(partnerId)
    : { people: [] };

  return (
    <PartnerContacts
      contacts={contacts}
      people={people}
      partnerId={partnerId}
      canManage={canManage}
    />
  );
};

export default Page;