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
import { getColumns } from "@/components/dashboard/people-directory/adoption-applications/person-adoption-applications-table-columns";
import { fetchPersonAdoptionApplications } from "@/app/lib/data/people-directory/person-adoption-applications.data";
import { fetchPersonHasUserAccount } from "@/app/lib/data/people-directory/people-directory.data";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { hasPermission } from "@/app/lib/auth/hasPermission";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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

  const [canManage, { applications, totalPages, totalRows }, hasUserAccount] =
    await Promise.all([
      hasPermission(AppPermissions.PERSONS_MANAGE),
      fetchPersonAdoptionApplications(currentPage, personId),
      fetchPersonHasUserAccount(personId),
    ]);

  const showAddButton = canManage && !hasUserAccount;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">
          Adoption Applications
        </CardTitle>
        <CardDescription>
          Applications this person has submitted.
        </CardDescription>
        {showAddButton && (
          <CardAction>
            <Button asChild size="sm">
              <Link
                href={`/dashboard/adoption-applications/new?personId=${personId}&returnTo=/dashboard/people-directory/${personId}/adoption-applications`}
              >
                Add Application
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={applications}
                getColumns={getColumns}
                columnProps={{ canManage, canEdit: showAddButton, personId }}
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
