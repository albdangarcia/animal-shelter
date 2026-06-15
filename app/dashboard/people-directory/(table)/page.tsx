import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchParamsType } from "@/app/lib/types";
import PeopleTableToolbar from "@/components/dashboard/people-directory/table/people-directory-table-toolbar";
import { columns } from "@/components/dashboard/people-directory/table/people-directory-table-columns";
import DataTable from "@/components/table-common/data-table";
import { Authorize } from "@/components/auth/authorize";
import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";
import { Permissions } from "@/app/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { fetchPeople } from "@/app/lib/data/people-directory/people-directory.data";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={Permissions.PERSONS_READ_LISTING}
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

  const { people, totalPages, totalRows } = await fetchPeople(
    query,
    currentPage,
    sort,
    currentPageSize,
    type,
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="font-semibold tabular-nums @[650px]/card:text-xl">
          People Directory
        </CardTitle>
        <CardDescription>
          View and manage records for adopters, volunteers, and shelter
          contacts.
        </CardDescription>
        <CardAction>
          <Button asChild>
            <Link href="/dashboard/people-directory/new">Add Person</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={people}
                columns={columns}
                ToolbarComponent={PeopleTableToolbar}
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
