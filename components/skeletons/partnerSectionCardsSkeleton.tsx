import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PartnerSectionCardsSkeleton = () => {
  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
      {/* Left column — detail card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              {/* Partner name */}
              <Skeleton className="h-6 w-48" />
              {/* Type badge */}
              <Skeleton className="h-5 w-28 rounded-md" />
            </div>
            {/* Edit Partner button */}
            <Skeleton className="h-8 w-28" />
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Status badge */}
          <Skeleton className="h-5 w-16 rounded-md" />

          {/* Contact info rows (email, phone, website, address) */}
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b pb-2"
              >
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>

          {/* Primary contact */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Right column — 2×2 stat tiles */}
      <div className="grid grid-cols-2 gap-4 content-start">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="mt-2 h-7 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default PartnerSectionCardsSkeleton;