import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchParamsType } from "@/app/lib/types";
import DataTable from "@/components/table-common/data-table";
import { getColumns } from "@/components/dashboard/adoption-applications/table/adoption-applications-table-columns";
import UserAppTableToolbar from "@/components/dashboard/adoption-applications/table/adoption-applications-table-toolbar";
import { fetchUserAdoptionApplications } from "@/app/lib/data/user-adoption-application.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.APPLICATIONS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const {
    query = "",
    page = "1",
    pageSize = "10",
    sort,
    status,
  } = await searchParams;
  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  const { userApplications, totalPages, totalRows } =
    await fetchUserAdoptionApplications(
      query,
      currentPage,
      sort,
      status,
      currentPageSize,
    );

  const canManage = await hasPermission(
    AppPermissions.ANIMAL_ASSESSMENT_MANAGE,
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Adoption Applications
        </CardTitle>
        <CardDescription>
          Manage all incoming animal adoption applications.
        </CardDescription>
        <CardAction></CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={userApplications}
                getColumns={getColumns}
                columnProps={{ canManage }}
                ToolbarComponent={UserAppTableToolbar}
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
