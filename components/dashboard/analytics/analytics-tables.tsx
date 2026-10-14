import {
  fetchAnimalsUnderCare,
  fetchAnalyticsTaskTableData,
} from "@/app/lib/data/analytics.data";
import { getShelterToday } from "@/app/lib/data/shelter-settings.data";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";

import { getRecentTasksColumns } from "@/components/dashboard/analytics/tables/tasks/recent-tasks-columns";
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
  // The Health tab lists care episodes from the medical record, so it is left
  // out for a viewer who can't read the record.
  const canReadMedical = await hasPermission(AppPermissions.MEDICAL_READ);
  const [tasks, underCare, today] = await Promise.all([
    fetchAnalyticsTaskTableData(),
    canReadMedical ? fetchAnimalsUnderCare() : null,
    getShelterToday(),
  ]);

  return (
    <Tabs defaultValue="animal-tasks">
      <TabsList>
        <TabsTrigger value="animal-tasks">Tasks</TabsTrigger>
        {underCare && <TabsTrigger value="health">Health</TabsTrigger>}
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
              getColumns={getRecentTasksColumns}
              columnProps={{ today }}
              ToolbarComponent={DataTableViewToolbarClient}
            />
          </CardContent>
        </Card>
      </TabsContent>
      {underCare && (
        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle>Animal Health</CardTitle>
              <CardDescription>Animals with an open care episode.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={underCare}
                columns={healthColumns}
                ToolbarComponent={DataTableViewToolbarClient}
              />
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  );
};

export default AnalyticsTables;