import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const Loading = () => {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Animal History
        </CardTitle>
        <CardDescription>
          Animals this person has been involved with, as a surrenderer, finder,
          owner, applicant, or foster carer.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="border rounded-lg p-4">
              <div className="flex items-start gap-4">
                {/* Animal image */}
                <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />

                <div className="flex-1">
                  {/* Role badge, name, species, status badge */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Skeleton className="h-5 w-24 rounded-md" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-20 rounded-md" />
                  </div>
                  {/* Timestamp */}
                  <Skeleton className="h-3 w-24 mt-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default Loading;
