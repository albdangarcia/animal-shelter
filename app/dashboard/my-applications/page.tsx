import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DataTable from "@/components/table-common/data-table";
import { columns } from "@/components/dashboard/my-adoption-applications/table/my-applications-table-columns";
import { SearchParamsType } from "@/app/lib/types";
import MyAppTableToolbar from "@/components/dashboard/my-adoption-applications/table/my-applications-table-toolbar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { fetchMyApplications } from "@/app/lib/data/my-applications.data";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  const { query = "", page = "1", pageSize = "10", sort, status } = await searchParams;
  const currentPage = Number(page);
  const currentPageSize = Number(pageSize);

  const { myApplications, totalPages, totalRows } = await fetchMyApplications(
    query,
    currentPage,
    sort,
    status,
    currentPageSize
  );

  return (
    <>
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="font-semibold tabular-nums @[650px]/card:text-xl">
            My applications
          </CardTitle>
          <CardDescription>
            List of your submitted adoption applications.
          </CardDescription>
          <CardAction>
            <Button asChild>
              <Link href="/pets">Adopt Pets</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="flex flex-col gap-4 md:gap-6">
                <DataTable
                  data={myApplications}
                  columns={columns}
                  ToolbarComponent={MyAppTableToolbar}
                  totalPages={totalPages}
                  totalRows={totalRows}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default Page;
