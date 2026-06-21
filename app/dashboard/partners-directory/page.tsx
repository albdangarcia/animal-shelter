import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchParamsType } from "@/app/lib/types";
import PartnersTableToolbar from "@/components/dashboard/partners-directory/table/partners-directory-table-toolbar";
import { getColumns } from "@/components/dashboard/partners-directory/table/partners-directory-table-columns";
import DataTable from "@/components/table-common/data-table";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { fetchPartners } from "@/app/lib/data/partners-directory/partners-directory.data";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PARTNERS_READ}
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
    status,
  } = await searchParams;
  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  const { partners, totalPages, totalRows } = await fetchPartners(
    query,
    currentPage,
    sort,
    currentPageSize,
    type,
    status,
  );

  const canManage = await hasPermission(AppPermissions.PARTNERS_MANAGE);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="font-semibold tabular-nums @[650px]/card:text-xl">
          Partner Directory
        </CardTitle>
        <CardDescription>
          View and manage shelters, rescue groups, vet clinics, and government
          agencies.
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
                href="/dashboard/partners-directory/new"
                aria-disabled={!canManage}
                tabIndex={canManage ? undefined : -1}
              >
                Add Partner
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
                data={partners}
                getColumns={getColumns}
                columnProps={{ canManage }}
                ToolbarComponent={PartnersTableToolbar}
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