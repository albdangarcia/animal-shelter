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
        <CardTitle className="@[650px]/card:text-xl">AI Activity</CardTitle>
        <CardDescription>
          Every change the assistant made to shelter data, and whether it has
          been undone. Chat history is not kept, so this is the durable record.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTableSkeleton columnCount={7} rowCount={8} filterCount={2} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Loading;
