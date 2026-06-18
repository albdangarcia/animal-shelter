import {
  fetchAnimalsRequiringAttention,
  fetchAnalyticsTaskTableData,
} from "@/app/lib/data/analytics.data";

import { recentTasksColumns } from "@/components/dashboard/analytics/tables/tasks/recent-tasks-columns";
import { healthColumns } from "@/components/dashboard/analytics/tables/animal-health/recent-health-columns";
import DataTable from "@/components/dashboard/analytics/tables/data-table-client";
import { DataTableViewToolbarClient } from "@/components/dashboard/analytics/tables/data-table-view-toolbar-client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const AnalyticsTables = async () => {
  const [tasks, animalHealth] = await Promise.all([
    fetchAnalyticsTaskTableData(),
    fetchAnimalsRequiringAttention(),
  ]);

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
            <DataTable
              data={tasks}
              columns={recentTasksColumns}
              ToolbarComponent={DataTableViewToolbarClient}
            />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="health">
        <Card>
          <CardHeader>
            <CardTitle>Animal Health</CardTitle>
            <CardDescription>
              This tab flags animals that are in a special state requiring
              administrative or medical oversight.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              data={animalHealth}
              columns={healthColumns}
              ToolbarComponent={DataTableViewToolbarClient}
            />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default AnalyticsTables;