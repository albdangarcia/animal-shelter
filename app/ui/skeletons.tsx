import { HeartIcon } from "@heroicons/react/16/solid";

// Loading animation
const shimmer =
  "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent";

// dashboard: skeleton for the pets table
export function PetsTableSkeleton() {
  return (
    <div
      className="mt-6 bg-white border border-gray-200 rounded-md shadow-sm pb-4 pt-1"
    >
      <div className="hidden border-b text-sm font-medium sm:grid grid-cols-[minmax(150px,1fr)_repeat(4,minmax(10px,1fr))_minmax(80px,1fr)] gap-4 px-6 py-4 rounded-t-md">
        <div className="text-nowrap">Name</div>
        <div className="text-nowrap">Status</div>
        <div className="text-nowrap">Age</div>
        <div className="text-nowrap">Location</div>
        <div className="text-nowrap">Species</div>
        <div className="text-nowrap text-center">Edit</div>
      </div>

      <div className="bg-gray-100 text-sm [&>div:not(:last-child)]:border-b">
        <PetsTableRowSkeleton />
        <PetsTableRowSkeleton />
        <PetsTableRowSkeleton />
        <PetsTableRowSkeleton />
        <PetsTableRowSkeleton />
        <PetsTableRowSkeleton />
      </div>
    </div>
  );
}

// dashboard: skeleton for the pets table rows
export function PetsTableRowSkeleton() {
  return (
    <div className={`${shimmer} relative grid items-center grid-cols-[minmax(150px,1fr)_repeat(4,minmax(10px,1fr))_minmax(80px,1fr)] sm:grid-cols-[minmax(150px,1fr)_repeat(4,minmax(10px,1fr))_minmax(80px,1fr)] gap-y-0 gap-4 py-4 px-6 sm:py-2 text-gray-900 hover:bg-gray-100/50`}>
      <div className="col-span-6 sm:col-span-1">
        <div className="flex items-center space-x-2">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
          </div>
          <div className="h-6 w-24 rounded bg-gray-200" />
        </div>
      </div>
      <div className="h-6 w-16 rounded bg-gray-200" />

      <div className="h-6 w-9 sm:w-12 rounded bg-gray-200" />
      <div className="h-6 w-9 sm:w-12 rounded bg-gray-200" />
      <div className="h-6 w-9 sm:w-12 rounded bg-gray-200" />

      <div className="flex justify-end sm:justify-center gap-3 col-span-2 sm:col-span-1">
        <div className="h-[38px] w-[38px] rounded bg-gray-200" />
        <div className="h-[38px] w-[38px] rounded bg-gray-200" />
      </div>
    </div>
  );
}

// dashboard: skeleton for the dashboard
export default function DashboardSkeleton() {
  return (
    <>
      <div
        className={`${shimmer} relative mb-4 h-8 w-36 overflow-hidden rounded-md bg-gray-100`}
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8">
        <LatestPetsSkeleton />
      </div>
    </>
  );
}

// dashboard: skeleton for the latest pets
export function LatestPetsSkeleton() {
  return (
    <div
      className={`${shimmer} relative flex w-full flex-col overflow-hidden md:col-span-4`}
    >
      <div className="mb-4 h-8 w-36 rounded-md bg-gray-100" />
      <div className="flex grow flex-col justify-between rounded-xl bg-gray-100 p-4">
        <div className="bg-white px-6">
          <LatestPetRowSkeleton />
          <LatestPetRowSkeleton />
          <LatestPetRowSkeleton />
          <LatestPetRowSkeleton />
          <LatestPetRowSkeleton />
          <div className="flex items-center pb-2 pt-6">
            <div className="h-5 w-5 rounded-full bg-gray-200" />
            <div className="ml-2 h-4 w-20 rounded-md bg-gray-200" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LatestPetRowSkeleton() {
  return (
    <div className="flex flex-row items-center justify-between border-b border-gray-100 py-4">
      <div className="flex items-center">
        <div className="mr-2 h-8 w-8 rounded-full bg-gray-200" />
        <div className="min-w-0">
          <div className="h-5 w-40 rounded-md bg-gray-200" />
        </div>
      </div>
      <div className="mt-2 h-5 w-20 rounded-md bg-gray-200" />
      <div className="mt-2 h-5 w-10 rounded-md bg-gray-200" />
    </div>
  );
}

// dashboard: skeleton for the cards
export function CardSkeleton() {
  return (
    <div
      className={`${shimmer} relative overflow-hidden rounded-xl bg-gray-100 p-2 shadow-sm`}
    >
      <div className="flex p-2">
        <div className="ml-2 h-6 w-16 rounded-md bg-gray-200 text-sm font-medium" />
      </div>
      <div className="flex items-center justify-center truncate rounded-xl px-4 py-8">
        <div className="h-7 w-20 rounded-md bg-gray-200" />
      </div>
    </div>
  );
}
export function CardsSkeleton() {
  return (
    <>
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </>
  );
}

export function PaginationSkeleton() {
  return (
    <>
      <div className="border border-gray-300 h-10 w-10 bg-gray-100 rounded" />
      <div className="border border-gray-300 h-10 w-10 bg-gray-100 rounded ml-3 mr-3" />
      <div className="border border-gray-300 h-10 w-10 bg-gray-100 rounded" />
    </>
  );
}

export function UsersTableSkeleton() {
  return (
    <div
      className="mt-6 bg-white border border-gray-200 rounded-md shadow-sm pb-4 pt-1"
    >
      <div className="hidden border-b text-sm font-medium sm:grid grid-cols-4 gap-4 px-6 py-4 rounded-t-md">
        <div className="text-nowrap col-span-2">Email</div>
        <div className="text-nowrap">Role</div>
        <div className="text-nowrap text-center">Edit</div>
      </div>

      <div className="bg-gray-100 text-sm [&>div:not(:last-child)]:border-b">
        <UsersTableRowSkeleton />
        <UsersTableRowSkeleton />
        <UsersTableRowSkeleton />
        <UsersTableRowSkeleton />
        <UsersTableRowSkeleton />
        <UsersTableRowSkeleton />
      </div>
    </div>
  );
}

export function UsersTableRowSkeleton() {
  return (
    <div className={`${shimmer} relative grid items-center grid-cols-4 gap-y-0 gap-4 py-4 px-6 sm:py-2 text-gray-900 hover:bg-gray-100/50`}>
      <div className="col-span-4 sm:col-span-2">
        <div className="flex items-center space-x-2">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
          </div>
          <div className="h-6 w-24 rounded bg-gray-200" />
        </div>
      </div>
      <div className="h-6 w-16 rounded bg-gray-200" />
      <div className="flex justify-end sm:justify-center gap-3 col-span-3 sm:col-span-1">
        <div className="h-[38px] w-[38px] rounded bg-gray-200" />
        <div className="h-[38px] w-[38px] rounded bg-gray-200" />
      </div>
    </div>
  );
}

export function FrontPetsCardSkeleton() {
  return (
    <div className="mt-6 flex gap-3 flex-wrap">
      <PetCardSkeleton />
      <PetCardSkeleton />
      <PetCardSkeleton />
      <PetCardSkeleton />
      <PetCardSkeleton />
      <PetCardSkeleton />
    </div>
  );
}
export function PetCardSkeleton() {
  return (
    <div className={`${shimmer} relative bg-gray-100 border border-gray-200 p-4 shadow-md rounded-md w-40 flex flex-col items-center justify-center`}>
      <HeartIcon className="absolute top-2 right-2 h-6 w-6 text-red-300" />
      <div>
        <div className="w-full">
          <div className="h-28 w-28 bg-gray-200 rounded-md" />
          <div className="h-5 w-24 rounded bg-gray-200 mt-1" />
          <div className="h-5 w-24 rounded bg-gray-200 mt-1" />
        </div>
      </div>
    </div>
  );
}
