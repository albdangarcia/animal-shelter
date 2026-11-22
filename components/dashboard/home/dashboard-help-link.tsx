import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { HelpLink } from "@/components/dashboard/help/help-link";

/**
 * The "?" beside the Dashboard heading. Its own component, so the guide read
 * waits in a Suspense of its own and never holds the heading or the cards.
 * Renders nothing for a viewer who can't see the guide (one without
 * `ANIMAL_READ_ANALYTICS`).
 */
const DashboardHelpLink = async () => (
  <HelpLink guide={await getHelpLinkGuide(PAGE_HELP_GUIDES.dashboardHome)} />
);

export default DashboardHelpLink;
