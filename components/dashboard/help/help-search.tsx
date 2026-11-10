"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { HELP_QUERY_MAX_LENGTH } from "@/app/lib/guides/help-paths";

/**
 * The Help page's search box. The query lives in the URL (`?q=`) and the page
 * searches on the server, as the table filters do. Typing replaces the URL
 * after a pause; Enter replaces it at once. Without JavaScript the form
 * still submits `?q=` the plain way.
 */
export function HelpSearch() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const current = searchParams.get("q") ?? "";
  const [value, setValue] = useState(current);

  // A query the URL gets from elsewhere (Back, a link) shows in the box. One
  // the box itself wrote matches what is typed, trimmed, and is left alone,
  // so a space typed between words stays.
  const [seen, setSeen] = useState(current);
  if (current !== seen) {
    setSeen(current);
    if (current !== value.trim()) setValue(current);
  }

  const apply = (term: string) => {
    const params = new URLSearchParams(searchParams);
    const trimmed = term.trim();
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname);
  };
  const applyLater = useDebouncedCallback(apply, 300);

  return (
    <form
      role="search"
      action={pathname}
      onSubmit={(event) => {
        event.preventDefault();
        applyLater.cancel();
        apply(value);
      }}
      className="relative max-w-xl"
    >
      <label htmlFor="help-search" className="sr-only">
        Search help
      </label>
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        id="help-search"
        name="q"
        type="search"
        value={value}
        maxLength={HELP_QUERY_MAX_LENGTH}
        placeholder="Search guides, such as “give a shot”"
        autoComplete="off"
        onChange={(event) => {
          setValue(event.target.value);
          applyLater(event.target.value);
        }}
        className="pl-9"
      />
    </form>
  );
}
