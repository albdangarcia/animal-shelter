import { Suspense } from "react";
import Search from "../../../components/search";
import {
  fetchAvailableAnimalCount,
  fetchSpecies,
  fetchColors,
} from "@/app/lib/data/public.data";
import PetGrid from "@/components/public-pages/pets/pet-grid";
import CategoryList from "@/components/public-pages/pets/category-list";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import { ResetFilters } from "@/components/public-pages/pets/reset-filters";
import {
  describePetFilters,
  joinFilterLabels,
} from "@/components/public-pages/pets/filter-summary";
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

// One pill shape for every control in the bar, so the row reads as one set.
// `border-solid` is doing work: the faceted filter still ships the dashed
// trigger its dashboard callers expect, and tailwind-merge keeps border-style
// and border-colour in separate groups, so `border-border` alone won't undash
// it. `has-[>svg]:px-*` restates the padding past shadcn Button's icon variant,
// which outranks a plain `px-` class.
const TRIGGER_PILL =
  "h-9 rounded-full border-solid border-border bg-transparent px-[18px] has-[>svg]:px-[18px] text-[13.5px] shadow-none";

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

  const filterLabels = describePetFilters({
    query,
    category,
    color,
    sex,
    size,
  });

  return (
    <>
      {/* The same accent band the nav carries, so the two read as one surface
          and there's no seam under the nav. */}
      <section className="bg-organic-accent-100">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:px-14">
          <h1 className="mb-4 font-display text-[clamp(34px,5vw,56px)] leading-[1.05] tracking-[-0.02em]">
            All animals
          </h1>

          {/* The count is the one live thing in the band, so it sits in its own
              boundary — the heading must not wait on a query to paint. */}
          <Suspense fallback={<p className="text-[15px]">&nbsp;</p>}>
            <CountLine filterLabels={filterLabels} />
          </Suspense>
        </div>
      </section>

      {/* The layout is full-bleed now, so every page owns its own container. */}
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 lg:px-14">
        {/* Species is the axis people browse by, so it leads the bar on its own
            full-width row and the refinements sit under it. */}
        <CategoryList species={speciesList} />

        <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
          {/* min-w-0 so the search box shrinks instead of forcing the row wider
              than the viewport at 320px. */}
          <div className="w-full min-w-0 lg:w-auto lg:max-w-sm lg:flex-1">
            <Search
              placeholder="Search by name, breed, or city"
              className="h-9 rounded-full border-border bg-card pl-11 shadow-none"
              iconClassName="left-4 h-4 w-4 text-organic-neutral-500"
            />
          </div>

          <div className="flex flex-row flex-wrap items-center gap-2">
            {/* Each of these portals its dropdown to <body>, outside the layout's
                .theme-organic div. They're shared with the dashboard, so the
                scope is re-opened here at the call site rather than inside the
                primitive — and the pill trigger comes in the same way. */}
            <ServerSideFacetedFilter
              title="Color"
              paramKey="color"
              options={colorOptions}
              contentClassName="theme-organic"
              triggerClassName={TRIGGER_PILL}
              badgeClassName="bg-organic-accent-200 text-organic-accent-800"
            />
            <ServerSideFacetedFilter
              title="Sex"
              paramKey="sex"
              options={SexOptions}
              contentClassName="theme-organic"
              triggerClassName={TRIGGER_PILL}
              badgeClassName="bg-organic-accent-200 text-organic-accent-800"
            />
            <ServerSideFacetedFilter
              title="Size"
              paramKey="size"
              options={SizeOptions}
              contentClassName="theme-organic"
              triggerClassName={TRIGGER_PILL}
              badgeClassName="bg-organic-accent-200 text-organic-accent-800"
            />
            <ServerSideSort
              paramKey="sort"
              placeholder="Sort by"
              options={SORT_OPTIONS}
              contentClassName="theme-organic"
              triggerClassName={`${TRIGGER_PILL} data-[size=sm]:h-9`}
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
    </>
  );
};

/**
 * "N looking for homes right now" plus, when filters are on, what they are.
 *
 * The number is always the unfiltered total, which is why the filtered phrasing
 * says "in all" — quoting a total beside a narrowed grid without saying so reads
 * as a miscount.
 */
const CountLine = async ({ filterLabels }: { filterLabels: string[] }) => {
  const availableCount = await fetchAvailableAnimalCount();
  const noun = availableCount === 1 ? "animal" : "animals";

  return (
    <p className="text-[15px] text-organic-neutral-800">
      {filterLabels.length > 0 ? (
        <>
          Filtered to {joinFilterLabels(filterLabels)}
          <span aria-hidden="true"> · </span>
          {availableCount} {noun} looking for homes in all
        </>
      ) : (
        <>
          {availableCount} {noun} looking for homes right now
        </>
      )}
    </p>
  );
};

export default Page;
