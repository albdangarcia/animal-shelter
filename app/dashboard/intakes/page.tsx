import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchParamsType } from "@/app/lib/types";
import DataTable from "@/components/table-common/data-table";
import { getColumns } from "@/components/dashboard/intakes/table/intake-table-columns";
import IntakeTableToolbar from "@/components/dashboard/intakes/table/intake-table-toolbar";
import { fetchIntakes } from "@/app/lib/data/animals/intake.data";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.INTAKE_READ}
      fallback={<StatusPage type="accessDenied" />}
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
    type,
  } = await searchParams;
  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  const [{ intakes, totalPages, totalRows }, canManage] = await Promise.all([
    fetchIntakes(query, currentPage, sort, type, currentPageSize),
    hasPermission(AppPermissions.INTAKE_MANAGE),
  ]);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Intakes</CardTitle>
        <CardDescription>
          Review every arrival at the shelter, first intakes and returns alike.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={intakes}
                getColumns={getColumns}
                columnProps={{ canManage }}
                ToolbarComponent={IntakeTableToolbar}
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
