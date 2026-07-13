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
import { getColumns } from "@/components/dashboard/foster-applications/table/foster-applications-table-columns";
import FosterApplicationsTableToolbar from "@/components/dashboard/foster-applications/table/foster-applications-table-toolbar";
import { fetchFosterApplications } from "@/app/lib/data/fosters/foster-applications.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.FOSTERS_READ}
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

  const { fosterApplications, totalPages, totalRows } =
    await fetchFosterApplications(
      query,
      currentPage,
      sort,
      status,
      currentPageSize,
    );

  const canManage = await hasPermission(AppPermissions.FOSTERS_MANAGE);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Foster Applications
        </CardTitle>
        <CardDescription>
          Review incoming foster applications and approve them onto the
          roster.
        </CardDescription>
        <CardAction>
          <span
            className={cn("inline-block", !canManage && "cursor-not-allowed")}
          >
            <Button
              asChild
              size="sm"
              variant={canManage ? "default" : "outline"}
              className={cn(!canManage && "pointer-events-none opacity-50")}
            >
              <Link
                href="/dashboard/fosters/new"
                aria-disabled={!canManage}
                tabIndex={canManage ? undefined : -1}
              >
                Add Foster
              </Link>
            </Button>
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={fosterApplications}
                getColumns={getColumns}
                columnProps={{ canManage }}
                ToolbarComponent={FosterApplicationsTableToolbar}
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
