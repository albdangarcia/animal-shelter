"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SpeciesModel } from "@/prisma/generated/models/Species";
import { cn } from "@/lib/utils";

interface Props {
  species: SpeciesModel[];
}

/**
 * Species filter, as the same inline pill row the homepage uses. Species
 * is the axis people browse by and the pills are already the site's vocabulary
 * for it, so it gets the row rather than a dropdown.
 *
 * These look like the homepage's pills and behave differently: the homepage has
 * nothing to filter, so its pills are links into /pets. These are buttons that
 * set `?category=`, and one of them is always the active one.
 *
 * The URL it writes is unchanged from the Select this replaced — `page` reset to
 * 1, `category` set or deleted, every other param carried through, applied with
 * `replace` so browsing species doesn't fill the back stack.
 */
const CategoryList = ({ species }: Props) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  // "All" is the row's first pill and means "no category param". Reading the
  // active value from the URL on every render keeps the row in step with
  // navigations it didn't cause — a Reset, or a back button.
  const currentValue = searchParams.get("category") || "All";
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
    // Scroll-snaps below sm rather than wrapping, matching the homepage row:
    // the species list grows from the dashboard and a three-line wrap at 320px
    // pushes the whole grid off the first screen.
    <div
      role="group"
      aria-label="Species"
      className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {optionList.map((value) => {
        const isActive = value === currentValue;

        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleCategoryChange(value)}
            className={cn(
              "shrink-0 cursor-pointer snap-start rounded-full border px-[18px] py-[9px] text-[13.5px] transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-primary hover:text-primary-foreground"
            )}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
};

export default CategoryList;
