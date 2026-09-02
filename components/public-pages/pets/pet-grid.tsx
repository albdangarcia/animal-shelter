import { fetchPublishedPets } from "@/app/lib/data/public.data";
import { getCachedSession } from "@/app/lib/auth/session";
import PetCard from "./pet-card";
import { SimplePagination } from "@/components/simple-pagination";

interface Props {
  query: string;
  currentPage: number;
  speciesName: string;
  colorNames: string;
  sex: string;
  size: string;
  sort: string;
}

const PetGrid = async ({
  query,
  currentPage,
  speciesName,
  colorNames,
  sex,
  size,
  sort,
}: Props) => {
  const session = await getCachedSession();
  const currentUserPersonId = session?.user?.personId;

  const { pets, totalPages } = await fetchPublishedPets({
    query,
    currentPage,
    speciesName,
    color: colorNames,
    sex,
    size,
    sort,
  });

  if (pets.length === 0) {
    return (
      <div className="text-center text-muted-foreground mt-10">
        <p>No pets found matching your criteria.</p>
      </div>
    );
  }

  return (
    <>
      <div className="my-6 mb-12 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
        {pets.map((pet) => (
          <PetCard
            key={pet.id}
            pet={pet}
            currentUserPersonId={currentUserPersonId}
          />
        ))}
      </div>
      <div className="flex justify-center">
        <SimplePagination totalPages={totalPages} />
      </div>
    </>
  );
};

export default PetGrid;