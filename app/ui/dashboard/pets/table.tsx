import Image from "next/image";
import { UpdatePet, DeletePet } from "@/app/ui/dashboard/pets/buttons";
import { fetchFilteredPets } from "@/app/lib/data/pets/pet";
import { PhotoIcon } from "@heroicons/react/24/solid";

// dashboard: table of pets
export default async function PetsTable({
  query,
  currentPage,
}: {
  query: string;
  currentPage: number;
}) {
  const pets = await fetchFilteredPets(query, currentPage);

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-md shadow-sm pb-4 pt-1">
      {/* table headers */}
      <div className="hidden border-b text-sm font-medium sm:grid grid-cols-[minmax(150px,1fr)_repeat(4,minmax(10px,1fr))_minmax(80px,1fr)] gap-4 px-6 py-4 rounded-t-md">
        <div className="text-nowrap">Name</div>
        <div className="text-nowrap">Status</div>
        <div className="text-nowrap">Age</div>
        <div className="text-nowrap">Location</div>
        <div className="text-nowrap">Species</div>
        <div className="text-nowrap text-center">Edit</div>
      </div>

      {/* table contents */}
      <div className="text-sm [&>div:not(:last-child)]:border-b">
        {pets?.map((pet) => (
          <div
            key={pet.id}
            className="grid items-center grid-cols-[minmax(150px,1fr)_repeat(4,minmax(10px,1fr))_minmax(80px,1fr)] sm:grid-cols-[minmax(150px,1fr)_repeat(4,minmax(10px,1fr))_minmax(80px,1fr)] gap-y-0 gap-4 py-4 px-6 sm:py-2 text-gray-900 hover:bg-gray-100/50"
          >
            <div className="col-span-6 sm:col-span-1">
              <div className="flex items-center space-x-2">
                {/* Flex container */}
                <div className="flex-shrink-0">
                  {/* Prevent the image from shrinking */}
                  {pet.petImages[0]?.url ? (
                    <Image
                      src={pet.petImages[0]?.url}
                      className="rounded-full w-7 h-7 object-cover"
                      width={50}
                      height={50}
                      alt={`${pet.name} profile picture`}
                    />
                  ) : (
                    <PhotoIcon className="w-7 text-gray-400" />
                  )}
                </div>
                <div className="truncate font-medium sm:font-normal">{pet.name}</div>
              </div>
            </div>
            <div className="truncate text-gray-500 sm:text-inherit">
              {pet.adoptionStatus.name}
            </div>
            <div className="truncate text-gray-500 sm:text-inherit">
              {pet.age}
            </div>
            <div className="text-gray-500 sm:text-inherit">{pet.state}</div>
            <div className="text-gray-500 sm:text-inherit">
              {pet.species.name}
            </div>
            <div className="flex justify-end sm:justify-center gap-3 col-span-2 sm:col-span-1">
              <UpdatePet id={pet.id} />
              <DeletePet id={pet.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
