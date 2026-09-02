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
    // The layout is full-bleed now, so every page owns its own container.
    <div className="mx-auto w-full max-w-6xl space-y-4 px-5 py-10 sm:px-8 sm:py-14 lg:px-14">
      <div className="space-y-1">
        <h1 className="font-display text-[clamp(38px,6vw,56px)]">Pet List</h1>
        <div className="text-sm text-muted-foreground">
          Currently available for adoption
        </div>
      </div>

      <div className="flex flex-row flex-wrap items-center justify-between gap-x-2 gap-y-2">
        {/* min-w-0 so the search box shrinks instead of forcing the row wider
            than the viewport at 320px. */}
        <div className="w-full min-w-0 sm:w-96">
          <Search placeholder="Search by name, breed, or city" />
        </div>

        <div className="flex flex-row flex-wrap items-center gap-2">
          {/* Each of these portals its dropdown to <body>, outside the layout's
              .theme-organic div. They're shared with the dashboard, so the
              scope is re-opened here at the call site rather than inside the
              primitive. */}
          <CategoryList species={speciesList} />
          <ServerSideFacetedFilter
            title="Color"
            paramKey="color"
            options={colorOptions}
            contentClassName="theme-organic"
          />
          <ServerSideFacetedFilter
            title="Sex"
            paramKey="sex"
            options={SexOptions}
            contentClassName="theme-organic"
          />
          <ServerSideFacetedFilter
            title="Size"
            paramKey="size"
            options={SizeOptions}
            contentClassName="theme-organic"
          />
          <ServerSideSort
            paramKey="sort"
            placeholder="Sort by"
            options={SORT_OPTIONS}
            contentClassName="theme-organic"
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