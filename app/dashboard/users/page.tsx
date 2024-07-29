import Pagination from "@/app/ui/dashboard/pets/pagination";
import Search from "@/app/ui/search";
import UsersTable from "@/app/ui/dashboard/users/table";
import { opensans } from "@/app/ui/fonts";
import { UsersTableSkeleton } from "@/app/ui/skeletons";
import { Suspense } from "react";
import { fetchUserPages } from "@/app/lib/data/users/user";

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
  const totalPages = await fetchUserPages(query);

  return (
    <div className="w-full">
      
      {/* page title */}
      <div className="flex w-full items-center justify-between">
        <h1 className={`${opensans.className} text-2xl`}>Users</h1>
      </div>
      
      {/* search bar */}
      <div className="mt-4 flex items-center justify-between gap-2 md:mt-8">
        <Search placeholder="Search email..." />
      </div>
      
      {/* table of users */}
      <Suspense key={query + currentPage} fallback={<UsersTableSkeleton />}>
        <UsersTable query={query} currentPage={currentPage} />
      </Suspense>
      
      {/* table pagination buttons */}
      <div className="mt-5 flex w-full justify-center">
        <Pagination totalPages={totalPages} />
      </div>
    </div>
  );
}
