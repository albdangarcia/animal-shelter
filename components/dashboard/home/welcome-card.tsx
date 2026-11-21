import Link from "next/link";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { getFilteredNavLinks } from "@/app/lib/getFilteredLinks";
import { navMainItems } from "@/components/dashboard/nav/nav-links.config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DASHBOARD_HREF = "/dashboard";

/**
 * A welcome for a viewer who cannot see the shelter's analytics (an applicant
 * or foster, say): a heading, one line, and a link to every page the sidebar
 * would offer them, from the same permission-filtered list. The Dashboard
 * entry is left out, as they are already on it. It does not redirect, because
 * such a viewer may have up to three destinations, or none, and the page
 * must render either way. Left out for a viewer with
 * `ANIMAL_READ_ANALYTICS`, who gets the cards instead.
 */
const WelcomeCard = async () => {
  if (await hasPermission(AppPermissions.ANIMAL_READ_ANALYTICS)) return null;

  // The nav already drops Dashboard for this viewer (it needs the same
  // permission); the filter keeps it out should that gate ever change.
  const links = (await getFilteredNavLinks(navMainItems)).filter(
    (item) => item.url !== DASHBOARD_HREF,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Welcome
        </CardTitle>
        <CardDescription>
          {links.length > 0
            ? "These are the pages you can open."
            : "There is nothing here for your account yet."}
        </CardDescription>
      </CardHeader>
      {links.length > 0 && (
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {links.map((item) => (
              <li key={item.url}>
                <Link
                  href={item.url}
                  className="text-primary font-medium underline-offset-4 hover:underline"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
};

export default WelcomeCard;
