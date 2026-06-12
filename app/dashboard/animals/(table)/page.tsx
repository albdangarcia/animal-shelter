import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DataTable from "@/components/table-common/data-table";
import { columns } from "@/components/dashboard/animals/table/animal-table-columns";
import { fetchAnimals } from "@/app/lib/data/animals/animal.data";
import { SearchParamsType } from "@/app/lib/types";
import AnimalsDataTableToolbar from "@/components/dashboard/animals/table/animal-table-toolbar";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
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

  const { animals, totalPages, totalRows } = await fetchAnimals(
    query,
    currentPage,
    listingStatus,
    sex,
    currentPageSize,
    sort,
  );

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="font-semibold tabular-nums @[650px]/card:text-xl">
          Animals
        </CardTitle>
        <CardDescription>
          Manage all animals currently in your care or begin the intake process
          for a new arrival.
        </CardDescription>
        <CardAction>
          <Button asChild>
            <Link href="/dashboard/animals/create">Add Animal</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 md:gap-6">
              <DataTable
                data={animals}
                columns={columns}
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
