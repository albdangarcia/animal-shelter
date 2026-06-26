import Search from "../../../components/search";
import { fetchSpecies, fetchColors } from "@/app/lib/data/public.data";
import PetGrid from "@/components/public-pages/pets/pet-grid";
import CategoryList from "@/components/public-pages/pets/category-list";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { ResetFilters } from "@/components/public-pages/pets/reset-filters";
import { SearchParamsType } from "@/app/lib/types";
import { SexOptions, SizeOptions } from "@/components/public-pages/pets/pets-filter-options";

interface Props {
  searchParams: SearchParamsType;
}

const SORT_OPTIONS = [
  { label: "Newest", value: "createdAt.desc" },
  { label: "Oldest", value: "createdAt.asc" },
  { label: "Youngest", value: "birthDate.desc" },
  { label: "Oldest pets", value: "birthDate.asc" },
  { label: "Name A–Z", value: "name.asc" },
];

const Page = async ({ searchParams }: Props) => {
  const {
    page = "1",
    category = "",
    query = "",
    color = "",
    sex = "",
    size = "",
    sort = "",
  } = await searchParams;
  const speciesName = category;
  const colorNames = color;
  const currentPage = Number(page);

  // get the list of species and colors for the filters
  const [speciesList, colorList] = await Promise.all([
    fetchSpecies(),
    fetchColors(),
  ]);

  const colorOptions = colorList.map((c) => ({
    label: c.name,
    value: c.name,
  }));

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
          <Search placeholder="Search by name, breed, or city" />
        </div>

        <div className="flex flex-row flex-wrap items-center gap-2">
          <CategoryList species={speciesList} speciesName={speciesName} />
          <ServerSideFacetedFilter
            title="Color"
            paramKey="color"
            options={colorOptions}
          />
          <ServerSideFacetedFilter
            title="Sex"
            paramKey="sex"
            options={SexOptions}
          />
          <ServerSideFacetedFilter
            title="Size"
            paramKey="size"
            options={SizeOptions}
          />
          <ServerSideSort
            paramKey="sort"
            placeholder="Sort by"
            options={SORT_OPTIONS}
          />
          <ResetFilters
            filterParamKeys={[
              "query",
              "category",
              "color",
              "sex",
              "size",
              "sort",
            ]}
          />
        </div>
      </div>

      {/* pets card */}
      <PetGrid
        query={query}
        currentPage={currentPage}
        speciesName={speciesName}
        colorNames={colorNames}
        sex={sex}
        size={size}
        sort={sort}
      />
    </div>
  );
};

export default Page;