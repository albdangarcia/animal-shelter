import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DataTable from "@/components/table-common/data-table";
import { getColumns } from "@/components/dashboard/animals/table/animal-table-columns";
import { fetchAnimals } from "@/app/lib/data/animals/animal.data";
import { SearchParamsType } from "@/app/lib/types";
import AnimalsDataTableToolbar from "@/components/dashboard/animals/table/animal-table-toolbar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { HelpLink } from "@/components/dashboard/help/help-link";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.ANIMAL_INFO_READ}
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
    sort, // e.g., "name.asc"
    listingStatus,
    sex,
  } = await searchParams;

  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  const [{ animals, totalPages, totalRows }, help, canManage] =
    await Promise.all([
      fetchAnimals(
        query,
        currentPage,
        listingStatus,
        sex,
        currentPageSize,
        sort,
      ),
      getHelpLinkGuide(PAGE_HELP_GUIDES.animals),
      hasPermission(AppPermissions.ANIMAL_INFO_MANAGE),
    ]);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Animals
        </CardTitle>
        <CardDescription>
          Manage all animals currently in your care or begin the intake process
          for a new arrival.
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/dashboard/animals/create">Add Animal</Link>
          </Button>
          <HelpLink guide={help} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={animals}
                getColumns={getColumns}
                columnProps={{ canManage }}
                ToolbarComponent={AnimalsDataTableToolbar}
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