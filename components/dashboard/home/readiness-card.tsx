import Link from "next/link";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import {
  READINESS_PERMISSIONS,
  fetchReadinessSummary,
} from "@/app/lib/data/analytics.data";
import {
  groupCountNoun,
  groupLine,
  moreLine,
  publishedBlockedLine,
  readinessHeadline,
  readyDraftsLine,
} from "@/app/lib/readiness/summary";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const BOARD_HREF = "/dashboard/readiness";
const LINK_CLASS = "font-medium underline-offset-4 hover:underline";

/**
 * "Readiness": the readiness board summed up — how many animals are ready,
 * the drafts waiting only to be published (named, as there is no list of
 * ready animals to link to), the published animals with something
 * outstanding, and the biggest blocker groups, each linking into the board.
 * Under care is not among the groups: its own card sits above. Left out for
 * a viewer without every permission its fetch needs (`READINESS_PERMISSIONS`).
 */
const ReadinessCard = async () => {
  const allowed = await Promise.all(
    READINESS_PERMISSIONS.map((permission) => hasPermission(permission)),
  );
  if (allowed.includes(false)) return null;

  const summary = await fetchReadinessSummary();
  const { animalCount, readyCount, readyDrafts, publishedBlockedCount, groups } =
    summary;
  const anyBlocked = readyCount < animalCount;
  const unnamed = readyDrafts.count - readyDrafts.named.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Readiness
        </CardTitle>
        <CardDescription>{readinessHeadline(summary)}</CardDescription>
      </CardHeader>
      {animalCount > 0 && (
        <CardContent className="flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <p
              className={
                readyDrafts.count === 0 ? "text-muted-foreground" : "font-medium"
              }
            >
              {readyDraftsLine(readyDrafts.count)}
            </p>
            {readyDrafts.count > 0 && (
              <p className="text-muted-foreground">
                {readyDrafts.named.map((animal, i) => (
                  <span key={animal.id}>
                    {i > 0 && ", "}
                    <Link
                      href={`/dashboard/animals/${animal.id}`}
                      className={`${LINK_CLASS} text-foreground`}
                    >
                      {animal.name}
                    </Link>
                  </span>
                ))}
                {unnamed > 0 && ` ${moreLine(unnamed)}`}
              </p>
            )}
          </div>
          {anyBlocked && (
            <>
              {publishedBlockedCount === 0 ? (
                <p className="text-muted-foreground">
                  {publishedBlockedLine(0)}
                </p>
              ) : (
                <Link
                  href={`${BOARD_HREF}?stage=PUBLISHED`}
                  className={LINK_CLASS}
                >
                  {publishedBlockedLine(publishedBlockedCount)}
                </Link>
              )}
              {groups.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium">Biggest blockers</h3>
                  <ul className="flex flex-col gap-1">
                    {groups.map((group) => (
                      <li key={group.kind}>
                        <Link
                          href={`${BOARD_HREF}?kind=${group.kind}`}
                          className={LINK_CLASS}
                        >
                          {groupLine(group)}
                          <span className="sr-only">
                            {" "}
                            {groupCountNoun(group)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
      {animalCount > 0 && (
        <CardFooter>
          <Link
            href={BOARD_HREF}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Open the readiness board
          </Link>
        </CardFooter>
      )}
    </Card>
  );
};

export default ReadinessCard;
