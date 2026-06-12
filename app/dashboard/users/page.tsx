import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchParamsType } from "@/app/lib/types";
import { fetchUsers } from "@/app/lib/data/user.data";
import UsersTableToolbar from "@/components/dashboard/users/table/users-table-toolbar";
import { columns } from "@/components/dashboard/users/table/users-table-columns";
import DataTable from "@/components/table-common/data-table";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { Permissions } from "@/app/lib/auth/permissions";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={Permissions.MANAGE_ROLES}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const { query = "", page = "1", pageSize = "10", sort, role } = await searchParams;
  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  const { users, totalPages, totalRows } = await fetchUsers(
    query,
    currentPage,
    sort,
    role,
    currentPageSize
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="font-semibold tabular-nums @[650px]/card:text-xl">
          Role Management
        </CardTitle>
        <CardDescription>
          Manage user roles and permissions efficiently.
        </CardDescription>
        <CardAction></CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={users}
                columns={columns}
                ToolbarComponent={UsersTableToolbar}
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