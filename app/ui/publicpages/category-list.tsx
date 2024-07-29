"use client";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/20/solid";
import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Species } from "@prisma/client";

export default function CategoryList({
  species,
  speciesName,
}: {
  species: Species[];
  speciesName: string;
}) {
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
    // if category is empty, default to the first option in the list
    <Listbox value={speciesName || optionList[0]}>
      <ListboxButton
        className={clsx(
          "relative block w-52 rounded-lg bg-white border border-gray-200 py-1.5 pr-8 pl-3 text-left text-sm/6 text-gray-600",
          "focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25"
        )}
      >
        {speciesName || optionList[0]}
        <ChevronDownIcon
          className="group pointer-events-none absolute top-2.5 right-2.5 size-4 fill-gray-600"
          aria-hidden="true"
        />
      </ListboxButton>
      <Transition
        leave="transition ease-in duration-100"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <ListboxOptions
          anchor="bottom"
          className="w-[var(--button-width)] z-10 bg-white rounded-xl border border-gray-200 p-1 [--anchor-gap:var(--spacing-1)] focus:outline-none"
        >
          {optionList.map((value) => (
            <ListboxOption
              key={value}
              value={value}
              onClick={() => handleCategoryChange(value)}
              className="group flex cursor-default items-center gap-2 rounded-lg py-1.5 px-3 select-none data-[focus]:bg-gray-100/60"
            >
              <CheckIcon className="invisible size-4 fill-gray-600 group-data-[selected]:visible" />
              <div className="text-sm/6 text-gray-600">{value}</div>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Transition>
    </Listbox>
  );
}
