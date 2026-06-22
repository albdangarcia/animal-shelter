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
import { getColumns } from "@/components/dashboard/outcomes/table/outcome-table-columns";
import OutcomeTableToolbar from "@/components/dashboard/outcomes/table/outcome-table-toolbar";
import { fetchOutcomes } from "@/app/lib/data/animals/outcome.data";
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
      permission={AppPermissions.OUTCOMES_READ}
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
    type,
  } = await searchParams;
  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  const { outcomes, totalPages, totalRows } = await fetchOutcomes(
    query,
    currentPage,
    sort,
    type,
    currentPageSize,
  );

  const canManage = await hasPermission(AppPermissions.OUTCOMES_MANAGE);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Outcomes
        </CardTitle>
        <CardDescription>
          Track and review the final disposition of all animals that have left
          the shelter.
        </CardDescription>
        <CardAction></CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={outcomes}
                getColumns={getColumns}
                columnProps={{ canManage }}
                ToolbarComponent={OutcomeTableToolbar}
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
