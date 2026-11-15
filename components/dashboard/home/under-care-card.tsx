import Link from "next/link";
import { CareEpisodeType } from "@/prisma/generated/enums";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import {
  UNDER_CARE_PERMISSIONS,
  fetchUnderCareSummary,
} from "@/app/lib/data/analytics.data";
import { CARE_EPISODE_TYPE_LABELS } from "@/app/lib/constants/medical";
import { formatShelterDay } from "@/app/lib/utils/shelter-day";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// In the order a reader scans them: at the shelter, away at a clinic, then
// under a vet wherever housed.
// Listed as the keys of a record, so a new type is a type error here until it
// is placed in the order, rather than counted and silently left out.
const TYPE_RANK: Record<CareEpisodeType, number> = {
  [CareEpisodeType.HOSPITALISED_IN_HOUSE]: 0,
  [CareEpisodeType.HOSPITALISED_OFF_SITE]: 1,
  [CareEpisodeType.UNDER_VET_CARE]: 2,
};
const TYPE_ORDER = (Object.keys(TYPE_RANK) as CareEpisodeType[]).sort(
  (a, b) => TYPE_RANK[a] - TYPE_RANK[b],
);

/**
 * "Under care": every animal in care under an open care episode, counted by
 * type, and the latest few, each linking to its medical record. Unlike the
 * attention panel's care group, an animal stays here while care is planned
 * for it. Left out for a viewer without every permission its fetch needs
 * (`UNDER_CARE_PERMISSIONS`).
 */
const UnderCareCard = async () => {
  const allowed = await Promise.all(
    UNDER_CARE_PERMISSIONS.map((permission) => hasPermission(permission)),
  );
  if (allowed.includes(false)) return null;

  const { countsByType, latest } = await fetchUnderCareSummary();
  const total = TYPE_ORDER.reduce((sum, type) => sum + countsByType[type], 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Under care
        </CardTitle>
        <CardDescription>
          {total === 0
            ? "No animals under care"
            : `${total} ${total === 1 ? "animal" : "animals"} with an open care episode`}
        </CardDescription>
      </CardHeader>
      {total > 0 && (
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {TYPE_ORDER.map((type) => (
              <div key={type} className="contents">
                <dt className="text-muted-foreground">
                  {CARE_EPISODE_TYPE_LABELS[type]}
                </dt>
                <dd className="text-right font-medium tabular-nums">
                  {countsByType[type]}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Latest</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {latest.map((episode) => (
                <li key={episode.id} className="flex flex-col">
                  <Link
                    href={`/dashboard/animals/${episode.animal.id}/medical`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {episode.animal.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {CARE_EPISODE_TYPE_LABELS[episode.type]} since{" "}
                    {formatShelterDay(episode.startDate)} · {episode.where}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default UnderCareCard;
