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
          Review and compare all adoption applications received for this animal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTableSkeleton columnCount={8} rowCount={8} filterCount={1} />
      </CardContent>
    </Card>
  );
};

export default Loading;