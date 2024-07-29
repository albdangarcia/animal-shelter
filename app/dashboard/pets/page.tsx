import Pagination from "@/app/ui/dashboard/pets/pagination";
import Search from "@/app/ui/search";
import PetsTable from "@/app/ui/dashboard/pets/table";
import { CreatePet } from "@/app/ui/dashboard/pets/buttons";
import { opensans } from "@/app/ui/fonts";
import { PetsTableSkeleton } from "@/app/ui/skeletons";
import { Suspense } from "react";
import { fetchPetsPages } from "@/app/lib/data/pets/pet";

export default async function Page({
  searchParams,
}: {
  searchParams?: {
    query?: string;
    page?: string;
  };
}) {
  const query = searchParams?.query || "";
  const currentPage = Number(searchParams?.page) || 1;
  const totalPages = await fetchPetsPages(query);

  return (
    <div className="w-full">
      
      {/* page title */}
      <div className="flex w-full items-center justify-between">
        <h1 className={`${opensans.className} text-2xl`}>Pets</h1>
      </div>
      
      {/* search bar */}
      <div className="mt-4 flex items-center justify-between gap-2 md:mt-8">
        <Search placeholder="Search pets..." />
        <CreatePet />
      </div>
      
      {/* table of pets */}
      <Suspense key={query + currentPage} fallback={<PetsTableSkeleton />}>
        <PetsTable query={query} currentPage={currentPage} />
      </Suspense>

      {/* table pagination buttons */}
      <div className="mt-5 flex w-full justify-center">
        <Pagination totalPages={totalPages} />
      </div>
    </div>
  );
}
