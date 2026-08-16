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
  speciesName: string;
}

const CategoryList = ({ species, speciesName }: Props) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  // List of options for the dropdown
  const optionList = ["All", ...species.map((s) => s.name)];

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
    <Select
      onValueChange={handleCategoryChange}
      // Set the default value. If `speciesName` is not in the URL, it defaults to "All".
      defaultValue={speciesName || "All"}
    >
      <SelectTrigger className="w-52">
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
