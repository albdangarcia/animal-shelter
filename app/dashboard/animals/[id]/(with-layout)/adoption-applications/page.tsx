import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IDParamType, SearchParamsType } from "@/app/lib/types";
import DataTable from "@/components/table-common/data-table";
import { getColumns } from "@/components/dashboard/adoption-applications/table/adoption-applications-table-columns";
import UserAppTableToolbar from "@/components/dashboard/adoption-applications/table/adoption-applications-table-toolbar";
import { fetchAnimalApplications } from "@/app/lib/data/animals/animal-adoption-application.data";
import { notFound } from "next/navigation";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";

interface Props {
  searchParams: SearchParamsType;
  params: IDParamType;
}

const Page = async ({ searchParams, params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.APPLICATIONS_READ}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} params={params} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams, params }: Props) => {
  const { id: animalId } = await params;

  const {
    query = "",
    page = "1",
    pageSize = "10",
    sort,
    status,
  } = await searchParams;
  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  if (!animalId) {
    return notFound();
  }

  const canManage = await hasPermission(
    AppPermissions.ANIMAL_ASSESSMENT_MANAGE,
  );

  const { applications, totalPages, totalRows } = await fetchAnimalApplications(
    animalId,
    query,
    currentPage,
    sort,
    status,
    currentPageSize,
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="font-semibold tabular-nums @[650px]/card:text-xl">
          Adoption Applications
        </CardTitle>
        <CardDescription>
          Review and compare all adoption applications received for this animal.
        </CardDescription>
        <CardAction></CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={applications}
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
