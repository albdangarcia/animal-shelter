"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <Button
      variant="ghost"
      onClick={() => router.push(pathname)}
      className="h-8 px-2 lg:px-3"
    >
      Reset
      <X className="ml-2 h-4 w-4" />
    </Button>
  );
}