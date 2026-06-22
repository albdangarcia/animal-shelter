import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  const rows = [0, 1, 2, 3];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Activity
        </CardTitle>
        <CardDescription>
          Recent activity involving this person — tasks, notes, assessments, and
          intake/outcome processing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flow-root">
          <ul className="-mb-8">
            {rows.map((row, index) => (
              <li key={row}>
                <div className="relative pb-8">
                  {/* Connector line — hidden on the last row */}
                  {index !== rows.length - 1 && (
                    <span
                      className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-border"
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex items-start space-x-4">
                    {/* Icon circle */}
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full ring-4 ring-card" />

                    {/* Details */}
                    <div className="min-w-0 grow">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-56" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default Loading;