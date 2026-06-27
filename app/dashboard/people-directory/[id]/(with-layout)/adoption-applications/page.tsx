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
import { columns } from "@/components/dashboard/people-directory/adoption-applications/person-adoption-applications-table-columns";
import { fetchPersonAdoptionApplications } from "@/app/lib/data/people-directory/person-adoption-applications.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Props {
  searchParams: SearchParamsType;
  params: IDParamType;
}

const Page = async ({ searchParams, params }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.PERSONS_READ}
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

  const [canManage, { applications, totalPages, totalRows }] = await Promise.all([
    hasPermission(AppPermissions.PERSONS_MANAGE),
    fetchPersonAdoptionApplications(currentPage, personId),
  ]);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Adoption Applications
        </CardTitle>
        <CardDescription>
          Applications this person has submitted.
        </CardDescription>
        <CardAction>
          <span className={cn(!canManage && "cursor-not-allowed")}>
            <Button
              asChild
              size="sm"
              className={cn(!canManage && "pointer-events-none opacity-50")}
            >
              <Link
                href={`/dashboard/people-directory/${personId}/adoption-applications/new`}
              >
                Add Application
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
