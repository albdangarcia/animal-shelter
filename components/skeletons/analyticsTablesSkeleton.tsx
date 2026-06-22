import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTableSkeleton } from "@/components/table-common/data-table-skeleton";

const AnalyticsTablesSkeleton = () => {
  return (
    <Tabs defaultValue="animal-tasks">
      <TabsList>
        <TabsTrigger value="animal-tasks">Tasks</TabsTrigger>
        <TabsTrigger value="health">Health</TabsTrigger>
      </TabsList>
      <TabsContent value="animal-tasks">
        <Card>
          <CardHeader>
            <CardTitle>Animal Tasks</CardTitle>
            <CardDescription>
              A quick view of the most recent tasks that are not yet completed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTableSkeleton columnCount={6} rowCount={6} showToolbar />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default AnalyticsTablesSkeleton;