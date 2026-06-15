import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IDParamType, SearchParamsType } from "@/app/lib/types";
import DataTable from "@/components/table-common/data-table";
import { columns } from "@/components/dashboard/people-directory/adoption-applications/person-adoption-applications-table-columns";
import { fetchPersonAdoptionApplications } from "@/app/lib/data/people-directory/person-adoption-applications.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { Permissions } from "@/app/lib/auth/permissions";

interface Props {
  searchParams: SearchParamsType;
  params: IDParamType;
}

const Page = async ({ searchParams, params }: Props) => {
  return (
    <Authorize
      permission={Permissions.PERSONS_READ_DETAIL}
      fallback={<PageNotFoundOrAccessDenied type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} params={params} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams, params }: Props) => {
  const { id: personId } = await params;
  const { page = "1" } = await searchParams;
  const currentPage = Number(page);

  const { applications, totalPages, totalRows } =
    await fetchPersonAdoptionApplications(currentPage, personId);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="font-semibold tabular-nums @[650px]/card:text-xl">
          Adoption Applications
        </CardTitle>
        <CardDescription>
          Applications this person has submitted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={applications}
                columns={columns}
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
