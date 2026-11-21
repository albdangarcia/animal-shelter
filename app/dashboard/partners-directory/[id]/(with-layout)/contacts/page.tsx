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
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

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

  const [canManage, { contacts }, help] = await Promise.all([
    hasPermission(AppPermissions.PARTNERS_MANAGE),
    fetchPartnerContacts(partnerId),
    getHelpLinkGuide(PAGE_HELP_GUIDES.partnerContacts),
  ]);

  // Only managers can add contacts, so only fetch the linkable list for them.
  const { people } = canManage
    ? await fetchLinkablePeople(partnerId)
    : { people: [] };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <HelpLink guide={help} />
      </div>
      <PartnerContacts
        contacts={contacts}
        people={people}
        partnerId={partnerId}
        canManage={canManage}
      />
    </div>
  );
};

export default Page;