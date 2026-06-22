import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/table-common/data-table-skeleton";

const Loading = () => {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Adoption Applications
        </CardTitle>
        <CardDescription>
          Manage all incoming animal adoption applications.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTableSkeleton columnCount={8} rowCount={8} filterCount={1} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Loading;