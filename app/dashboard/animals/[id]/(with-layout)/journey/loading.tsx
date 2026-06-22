import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Loading() {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Journey
        </CardTitle>
        <CardDescription>
          A timeline of significant events in the animal&apos;s story at the
          shelter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AnimalJourneySkeleton />
      </CardContent>
    </Card>
  );
}

const AnimalJourneySkeleton = () => {
  const rows = [0, 1, 2, 3];

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {rows.map((row, index) => (
          <li key={row}>
            <div className="relative pb-8">
              {/* Connector line — hidden on the last row, matching the real timeline */}
              {index !== rows.length - 1 ? (
                <span
                  className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-border"
                  aria-hidden="true"
                />
              ) : null}
              <div className="relative flex space-x-3">
                {/* Icon circle */}
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />

                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  {/* Left: title, description, author */}
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  {/* Right: date */}
                  <Skeleton className="h-3 w-20 shrink-0" />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
