"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SpeciesModel } from "@/prisma/generated/models/Species";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  species: SpeciesModel[];
}

const CategoryList = ({ species }: Props) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  // List of options for the dropdown
  const optionList = ["All", ...species.map((s) => s.name)];

  // Derive the displayed value from the URL on every render. A Radix Select
  // given only `defaultValue` is uncontrolled: it reads the prop once on mount
  // and then owns its own state, so a navigation that clears `category` (e.g.
  // the Reset button) moves the URL on while the trigger keeps showing the old
  // species. Reading searchParams here keeps the control in sync with the URL.
  const currentValue = searchParams.get("category") || "All";

  function handleCategoryChange(value: string) {
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");

    if (value === "All") {
      params.delete("category");
    } else {
      params.set("category", value);
    }
    // update the url
    replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Select onValueChange={handleCategoryChange} value={currentValue}>
      <SelectTrigger className="w-52" aria-label="Species">
        {/* SelectValue will display the selected value, or the placeholder if none is selected */}
        <SelectValue placeholder="Select a category" />
      </SelectTrigger>
      <SelectContent>
        {optionList.map((value) => (
          <SelectItem key={value} value={value}>
            {value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default CategoryList;
