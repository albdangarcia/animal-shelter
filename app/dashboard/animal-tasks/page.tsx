import { getColumns } from "@/components/dashboard/all-animal-tasks/table/task-table-columns";
import DataTable from "@/components/table-common/data-table";
import TasksDataTableToolbar from "@/components/dashboard/all-animal-tasks/table/task-table-toolbar";
import { SearchParamsType } from "@/app/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchAllAnimalsTasks } from "@/app/lib/data/all-animal-tasks.data";
import { fetchTaskAssigneeList } from "@/app/lib/data/animals/animal-task.data";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  const {
    query = "",
    page = "1",
    pageSize = "10",
    sort,
    category,
    status,
  } = await searchParams;

  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  // Whether the current user can manage tasks (edit assignee/status, delete, edit form).
  // Volunteers have ANIMAL_TASK_READ only; staff/admin have ANIMAL_TASK_MANAGE.
  // fetchAllAnimalsTasks doesn't depend on canManage, so run them in parallel.
  const [canManage, { tasks, totalPages, totalRows }] = await Promise.all([
    hasPermission(AppPermissions.ANIMAL_TASK_MANAGE),
    fetchAllAnimalsTasks(
      query,
      currentPage,
      category,
      status,
      currentPageSize,
      sort
    ),
  ]);

  // Only fetch the assignee list when the user can manage tasks.
  // fetchTaskAssigneeList is itself gated behind ANIMAL_TASK_MANAGE and would
  // throw for volunteers, so we must not call it otherwise.
  const assigneeList = canManage ? await fetchTaskAssigneeList() : [];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Tasks
        </CardTitle>
        <CardDescription>
          This page displays all tasks that are associated with all the animals.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={tasks}
                getColumns={getColumns}
                ToolbarComponent={TasksDataTableToolbar}
                totalPages={totalPages}
                columnProps={{ assigneeList, canManage }}
                totalRows={totalRows}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Page;