"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RESET_FILTER_SHAPE } from "@/components/table-common/reset-filter-shape";
import { cn } from "@/lib/utils";

interface ResetFiltersProps {
  /** param keys that count toward "isFiltered" (e.g. "query", "category", "color") */
  filterParamKeys?: string[];
}

export function ResetFilters({
  filterParamKeys = ["query", "category", "color"],
}: ResetFiltersProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const isFiltered = filterParamKeys.some((key) => searchParams.has(key));

  if (!isFiltered) return null;

  return (
    // Shape from the shared constant, color from the tokens this subtree
    // resolves — terracotta here, and whatever the dashboard's scope gives when
    // its own reset buttons pick the same device up.
    //
    // Every state names BOTH halves of its pairing, so a background can never
    // land without the foreground meant to sit on it. focus-visible previously
    // moved only the border and ring, leaving the label on the resting color.
    <Button
      variant="ghost"
      onClick={() => router.push(pathname)}
      className={cn(
        RESET_FILTER_SHAPE,
        "h-9 border-primary/45 text-primary",
        "hover:border-primary hover:bg-primary hover:text-primary-foreground",
        "focus-visible:border-primary focus-visible:bg-primary focus-visible:text-primary-foreground"
      )}
    >
      Reset
      <X className="size-3.5" />
    </Button>
  );
}
