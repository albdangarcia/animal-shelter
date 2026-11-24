import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SHELTER_DETAILS_DESCRIPTION } from "@/components/dashboard/settings/shelter-details/shelter-details-copy";

const Loading = () => {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Shelter Details</CardTitle>
        <CardDescription>{SHELTER_DETAILS_DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-xs rounded-lg border p-4 space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-32" />
        </div>
      </CardContent>
    </Card>
  );
};

export default Loading;
