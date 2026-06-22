import Search from "../../../components/search";
import { fetchSpecies } from "@/app/lib/data/public.data";
import PetGrid from "@/components/public-pages/pets/pet-grid";
import CategoryList from "@/components/public-pages/pets/category-list";
import { SearchParamsType } from "@/app/lib/types";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  const { page = "1", category = "", query = "" } = await searchParams;
  const speciesName = category;
  const currentPage = Number(page);

  // get the list of species
  const speciesList = await fetchSpecies();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-3xl font-medium">Pet List</div>
        <div className="text-sm text-gray-500">
          Currently available for adoption
        </div>
      </div>

      <div className="flex flex-row flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="w-96">
          <Search placeholder="Search pet name" />
        </div>

        {/* category option */}
        <CategoryList species={speciesList} speciesName={speciesName} />
      </div>

      {/* pets card */}
      <PetGrid
        query={query}
        currentPage={currentPage}
        speciesName={speciesName}
      />
    </div>
  );
};

export default Page;
