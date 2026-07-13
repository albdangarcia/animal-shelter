import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchParamsType } from "@/app/lib/types";
import FostersTableToolbar from "@/components/dashboard/fosters/table/foster-table-toolbar";
import { getColumns } from "@/components/dashboard/fosters/table/foster-table-columns";
import DataTable from "@/components/table-common/data-table";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { fetchFosters } from "@/app/lib/data/fosters/fosters.data";
import { fetchSpecies } from "@/app/lib/data/animals/animal.data";
import { hasPermission } from "@/app/lib/auth/hasPermission";

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
    species,
    capacity,
  } = await searchParams;
  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  const [{ fosters, totalPages, totalRows }, speciesList, canManage] =
    await Promise.all([
      fetchFosters(
        query,
        currentPage,
        sort,
        currentPageSize,
        status,
        species,
        capacity,
      ),
      fetchSpecies(),
      hasPermission(AppPermissions.FOSTERS_MANAGE),
    ]);

  const speciesOptions = speciesList.map((s) => ({ label: s.name, value: s.id }));

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Foster Roster</CardTitle>
        <CardDescription>
          Approved fosters, their capabilities, and current capacity.
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
                data={fosters}
                getColumns={getColumns}
                columnProps={{ canManage, speciesOptions }}
                ToolbarComponent={FostersTableToolbar}
                toolbarProps={{ canManage, speciesOptions }}
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
