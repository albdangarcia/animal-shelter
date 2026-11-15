import Link from "next/link";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import type { AppPermission } from "@/app/lib/auth/permissions";
import {
  ADOPTION_APPLICATIONS_WAITING_PERMISSIONS,
  FOSTER_APPLICATIONS_WAITING_PERMISSIONS,
  fetchAdoptionApplicationsWaiting,
  fetchFosterApplicationsWaiting,
} from "@/app/lib/data/analytics.data";
import {
  WAITING_STATUSES,
  waitingLine,
  type ApplicationKind,
  type ApplicationsWaiting,
} from "@/app/lib/utils/applications-waiting";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Each line opens its list already filtered to what it counted, oldest first.
// The adoption list filters by effective status, as the count does.
const LIST_QUERY = `?status=${WAITING_STATUSES.join(",")}&sort=submittedAt.asc`;
const LIST_HREF: Record<ApplicationKind, string> = {
  adoption: `/dashboard/adoption-applications${LIST_QUERY}`,
  foster: `/dashboard/foster-applications${LIST_QUERY}`,
};

const hasAll = async (permissions: readonly AppPermission[]) =>
  (await Promise.all(permissions.map((p) => hasPermission(p)))).every(Boolean);

/**
 * "Applications waiting": adoption and foster applications waiting for a
 * review decision (PENDING or REVIEWING), and how long the oldest has waited,
 * each line linking to its list. A line the viewer cannot read is left out
 * (`ADOPTION_APPLICATIONS_WAITING_PERMISSIONS`,
 * `FOSTER_APPLICATIONS_WAITING_PERMISSIONS`), and the card when both are.
 */
const ApplicationsWaitingCard = async () => {
  const [canAdoption, canFoster] = await Promise.all([
    hasAll(ADOPTION_APPLICATIONS_WAITING_PERMISSIONS),
    hasAll(FOSTER_APPLICATIONS_WAITING_PERMISSIONS),
  ]);
  if (!canAdoption && !canFoster) return null;

  const [adoption, foster] = await Promise.all([
    canAdoption ? fetchAdoptionApplicationsWaiting() : null,
    canFoster ? fetchFosterApplicationsWaiting() : null,
  ]);
  const lines = (
    [
      ["adoption", adoption],
      ["foster", foster],
    ] as const
  ).filter(
    (line): line is readonly [ApplicationKind, ApplicationsWaiting] =>
      line[1] !== null,
  );
  const total = lines.reduce((sum, [, waiting]) => sum + waiting.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Applications waiting
        </CardTitle>
        <CardDescription>
          {total === 0
            ? "No applications waiting"
            : "Waiting for a review decision"}
        </CardDescription>
      </CardHeader>
      {total > 0 && (
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {lines.map(([kind, waiting]) => (
              <li key={kind}>
                {waiting.count === 0 ? (
                  <span className="text-muted-foreground">
                    {waitingLine(kind, waiting)}
                  </span>
                ) : (
                  <Link
                    href={LIST_HREF[kind]}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {waitingLine(kind, waiting)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
};

export default ApplicationsWaitingCard;
