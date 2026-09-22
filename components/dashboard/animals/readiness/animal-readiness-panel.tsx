import { getShelterSettings } from "@/app/lib/data/shelter-settings.data";
import Link from "next/link";
import { IconArrowRight, IconCircleCheck } from "@tabler/icons-react";
import type { ReadinessBlocker } from "@/app/lib/readiness/compute-readiness";
import {
  blockerAction,
  describeBlocker,
  orderBlockers,
  type ReadinessViewerCan,
} from "@/app/lib/readiness/board";
import {
  blockerKey,
  KIND_META,
} from "@/components/dashboard/readiness/readiness-board";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  animalId: string;
  blockers: ReadinessBlocker[];
  can: ReadinessViewerCan;
}

export async function AnimalReadinessPanel({ animalId, blockers, can }: Props) {
  const timezone = (await getShelterSettings()).timezone;
  const ordered = orderBlockers(blockers);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Readiness</CardTitle>
        <CardDescription>
          What&apos;s still outstanding before this animal is fully ready for
          adoption.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconCircleCheck className="size-4 text-green-600 dark:text-green-400" />
            This animal is ready for adoption.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ordered.map((blocker) => {
              const meta = KIND_META[blocker.kind];
              const Icon = meta.icon;
              const action = blockerAction(blocker, animalId, can);
              return (
                <li
                  key={blockerKey(blocker)}
                  className="flex items-start gap-2 text-sm"
                >
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      meta.urgent
                        ? "text-red-600 dark:text-red-400"
                        : "text-amber-600 dark:text-amber-400",
                    )}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span>{describeBlocker(blocker, timezone)}</span>
                    <Link
                      href={action.href}
                      className="inline-flex items-center gap-1 font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
                    >
                      {action.label}
                      <IconArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
