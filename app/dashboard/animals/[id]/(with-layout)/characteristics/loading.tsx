import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const AnimalCharacteristicsSkeleton = () => {
  return (
    <Card className="@container/card">
      <CardHeader className="relative">
        <CardTitle className="@[650px]/card:text-xl">Characteristics</CardTitle>
        <CardDescription>
          Unique behavioral and medical traits for this animal.
        </CardDescription>
        {/* Edit button (CardAction sits top-right) */}
        <div className="absolute right-6 top-6">
          <Skeleton className="h-8 w-14" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Two placeholder category groups */}
          {[0, 1].map((group) => (
            <div key={group} className="border rounded-lg p-4 bg-card">
              {/* Category heading: icon + label */}
              <div className="flex items-center gap-2 mb-3">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-28" />
              </div>
              {/* Badge chips */}
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2].map((chip) => (
                  <Skeleton
                    key={chip}
                    className="h-6 rounded-md"
                    style={{ width: `${5 + group + chip}rem` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AnimalCharacteristicsSkeleton;
