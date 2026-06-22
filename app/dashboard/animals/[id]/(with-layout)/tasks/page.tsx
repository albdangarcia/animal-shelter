import {
  fetchAnimalTasks,
  fetchTaskAssigneeList,
} from "@/app/lib/data/animals/animal-task.data";
import { getColumns } from "@/components/dashboard/animals/tasks/table/task-table-columns";
import DataTable from "@/components/table-common/data-table";
import TasksDataTableToolbar from "@/components/dashboard/animals/tasks/table/task-table-toolbar";
import { IDParamType, SearchParamsType } from "@/app/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { AppPermissions } from "@/app/lib/auth/permissions";

interface Props {
  params: IDParamType;
  searchParams: SearchParamsType;
}

const Page = async ({ params, searchParams }: Props) => {
  const { id: animalId } = await params;

  const {
    query = "",
    page = "1",
    pageSize = "10",
    sort, // e.g., "name.asc"
    category,
    status,
  } = await searchParams;

  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  // Whether the current user can manage tasks (edit assignee/status, delete, edit form).
  // Volunteers have ANIMAL_TASK_READ only; staff/admin have ANIMAL_TASK_MANAGE.
  const canManage = await hasPermission(AppPermissions.ANIMAL_TASK_MANAGE);

  const { tasks, totalPages, totalRows } = await fetchAnimalTasks(
    query,
    currentPage,
    category,
    status,
    currentPageSize,
    sort,
    animalId,
  );

  // fetchTaskAssigneeList is gated behind ANIMAL_TASK_MANAGE and would throw
  // for volunteers, so only call it when the user can manage tasks.
  const assigneeList = canManage ? await fetchTaskAssigneeList() : [];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Tasks
        </CardTitle>
        <CardDescription>
          This page displays all tasks that are associated with this animal,
          which can be filtered and sorted.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={tasks}
                getColumns={getColumns}
                columnProps={{ animalId, assigneeList, canManage }}
                ToolbarComponent={TasksDataTableToolbar}
                toolbarProps={{ animalId, assigneeList, canManage }}
                totalPages={totalPages}
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
