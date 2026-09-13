"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import type { ReadinessBoardFilterOptions } from "@/app/lib/readiness/board";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { RESET_FILTER_SHAPE } from "@/components/table-common/reset-filter-shape";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FILTER_PARAM_KEYS = ["species", "location", "stage"] as const;

interface Props {
  options: ReadinessBoardFilterOptions;
}

export function ReadinessBoardToolbar({ options }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const isFiltered = FILTER_PARAM_KEYS.some((key) => searchParams.has(key));
  const isDrilledDown = searchParams.has("kind");

  // Reset stays on the current group when one is open — it only clears
  // species/location/stage, not `kind`. Leaving a group entirely is "All
  // groups" below, a separate control.
  const handleReset = () => {
    const params = new URLSearchParams(searchParams);
    for (const key of FILTER_PARAM_KEYS) params.delete(key);
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const overviewHref = (() => {
    const params = new URLSearchParams(searchParams);
    params.delete("kind");
    params.delete("page");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  })();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isDrilledDown && (
        <Button variant="ghost" size="sm" asChild className="h-8">
          <Link href={overviewHref}>
            <ArrowLeft className="size-3.5" />
            All groups
          </Link>
        </Button>
      )}
      <ServerSideFacetedFilter
        title="Species"
        paramKey="species"
        options={options.species}
      />
      <ServerSideFacetedFilter
        title="Location"
        paramKey="location"
        options={options.locations}
      />
      <ServerSideFacetedFilter
        title="Stage"
        paramKey="stage"
        options={options.stages}
      />
      {isFiltered && (
        <Button
          variant="ghost"
          onClick={handleReset}
          className={cn(
            RESET_FILTER_SHAPE,
            "rounded-md",
            // Same colors as the data tables' reset (see DataTableToolbar).
            "h-8 border-primary/45 text-primary",
            "hover:border-primary hover:bg-primary hover:text-primary-foreground",
            "dark:hover:bg-primary",
            "focus-visible:border-primary focus-visible:bg-primary focus-visible:text-primary-foreground",
          )}
        >
          Reset
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
