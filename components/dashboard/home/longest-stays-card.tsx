import Link from "next/link";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import {
  LONGEST_STAYS_PERMISSIONS,
  fetchLongestStays,
} from "@/app/lib/data/analytics.data";
import {
  NO_ANIMALS_IN_CARE,
  inCareLine,
  over90Line,
  returnedNote,
  stayDays,
} from "@/app/lib/utils/longest-stays";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const REPORT_HREF = "/dashboard/reports/length-of-stay";

/**
 * "Longest stays": the length-of-stay report's worklist cut to its first
 * five, with the report's in-care and over-90-days counts. "In care" is the
 * report's (intake/outcome pairing), so these are the first rows of the
 * report's "Longest current stays" table. Left out for a viewer without
 * every permission its fetch needs (`LONGEST_STAYS_PERMISSIONS`).
 */
const LongestStaysCard = async () => {
  const allowed = await Promise.all(
    LONGEST_STAYS_PERMISSIONS.map((permission) => hasPermission(permission)),
  );
  if (allowed.includes(false)) return null;

  const { inCareNow, over90, rows } = await fetchLongestStays();

  return (
    <Card className="@4xl/main:col-span-2">
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Longest stays
        </CardTitle>
        <CardDescription>
          {inCareNow === 0 ? (
            NO_ANIMALS_IN_CARE
          ) : (
            <>
              {inCareLine(inCareNow)} ·{" "}
              <span
                className={
                  over90 > 0
                    ? "font-medium text-amber-600 dark:text-amber-400"
                    : undefined
                }
              >
                {over90Line(over90)}
              </span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      {rows.length > 0 && (
        <CardContent>
          <ol className="divide-y text-sm">
            {rows.map((row) => {
              const note = returnedNote(row);
              return (
                <li
                  key={row.animalId}
                  className="flex items-baseline justify-between gap-4 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/animals/${row.animalId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.name}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {row.speciesName}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums">
                      {stayDays(row.currentStayDays)}
                    </div>
                    {note && (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {note}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      )}
      <CardFooter>
        <Link
          href={REPORT_HREF}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Length of stay report
        </Link>
      </CardFooter>
    </Card>
  );
};

export default LongestStaysCard;
