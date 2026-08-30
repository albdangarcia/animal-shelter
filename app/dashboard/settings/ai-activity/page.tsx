import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { SearchParamsType } from "@/app/lib/types";
import DataTable from "@/components/table-common/data-table";
import {
  fetchAiActivityActors,
  fetchAiActivityLog,
} from "@/app/lib/data/ai-activity.data";
import { getColumns } from "@/components/dashboard/ai-activity/table/ai-activity-table-columns";
import AiActivityTableToolbar from "@/components/dashboard/ai-activity/table/ai-activity-table-toolbar";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.AI_ACTIVITY_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const {
    page = "1",
    pageSize = "10",
    sort,
    state,
    actor,
  } = await searchParams;
  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  const [canManage, { rows, totalPages, totalRows }, actors] = await Promise.all([
    hasPermission(AppPermissions.ANIMAL_TASK_MANAGE),
    fetchAiActivityLog(currentPage, currentPageSize, sort, state, actor),
    fetchAiActivityActors(),
  ]);

  const actorOptions = actors.map((a) => ({ label: a.name, value: a.id }));

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
              <DataTable
                data={rows}
                getColumns={getColumns}
                ToolbarComponent={AiActivityTableToolbar}
                columnProps={{ canManage, actorOptions }}
                toolbarProps={{ canManage, actorOptions }}
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
