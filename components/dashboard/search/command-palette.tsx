"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

import type {
  AdoptionAppHit,
  AnimalHit,
  FosterAppHit,
  GlobalSearchResults,
  PartnerHit,
  PersonHit,
} from "@/app/lib/data/search/global-search";
import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { getIcon } from "@/components/dashboard/nav/icon-map";
import type { IconName } from "@/components/dashboard/nav/nav-links.config";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** A sidebar destination the layout has already filtered by permission. */
export type PaletteNavItem = {
  title: string;
  url: string;
  icon: IconName;
};

// Mirrors GLOBAL_SEARCH_MIN_QUERY_LENGTH. Spelled out rather than imported so
// this client module doesn't drag the server-side search module into the
// browser bundle — the route enforces the same floor whatever the client sends.
const MIN_QUERY_LENGTH = 2;

// `searchQuerySchema`'s cap. Typing past it could only ever earn a 400.
const MAX_QUERY_LENGTH = 100;

// The table toolbars debounce at 300ms, but those navigate; a palette that
// answers while you type has to feel quicker than that.
const DEBOUNCE_MS = 200;

// Set as a node rather than a plain string so the styling lands on this span
// instead of fighting the `[cmdk-group-heading]` rules further up the cascade.
// Left as-is, a heading is the same size, weight and colour as a row's second
// line, and "Adoption applications" reads as another result.
const groupHeading = (heading: string) => (
  <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
    {heading}
  </span>
);

// Lifted from `CommandDialog` in `components/ui/command.tsx`. The palette
// composes its own shell instead of using that wrapper, because it needs
// `shouldFilter` and `onKeyDown` on the command root and the wrapper only
// forwards to `Dialog` — patching it would leave a local edit for
// `shadcn add command` to overwrite.
const COMMAND_SHELL =
  "[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5";

type ResultRow = {
  href: string;
  primary: string;
  /** The muted second line. Null renders a single-line row. */
  secondary: string | null;
  badge: string | null;
};

type ResultGroup = {
  key: string;
  heading: string;
  rows: ResultRow[];
};

const joinDetails = (parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join(" · ") || null;

const animalRow = (hit: AnimalHit): ResultRow => ({
  href: `/dashboard/animals/${hit.id}`,
  primary: hit.name,
  secondary: joinDetails([hit.species, hit.breeds.join(", ")]),
  badge: formatSingleEnumOption(hit.listingStatus),
});

const personRow = (hit: PersonHit): ResultRow => ({
  href: `/dashboard/people-directory/${hit.id}`,
  primary: hit.name,
  secondary: hit.email ?? hit.phone,
  badge: hit.hasAccount ? "Account" : null,
});

const partnerRow = (hit: PartnerHit): ResultRow => ({
  href: `/dashboard/partners-directory/${hit.id}`,
  primary: hit.name,
  secondary: formatSingleEnumOption(hit.type),
  badge: hit.isActive ? null : "Inactive",
});

const adoptionAppRow = (hit: AdoptionAppHit): ResultRow => ({
  href: `/dashboard/adoption-applications/${hit.id}/review`,
  primary: hit.applicantName,
  secondary: hit.animalName,
  badge: formatSingleEnumOption(hit.status),
});

const fosterAppRow = (hit: FosterAppHit): ResultRow => ({
  href: `/dashboard/foster-applications/${hit.id}`,
  primary: hit.applicantName,
  secondary: null,
  badge: formatSingleEnumOption(hit.status),
});

// A null group means the caller may not read it and an empty one means nothing
// matched. Both are hidden, so they collapse to the same thing here.
const toResultGroups = (results: GlobalSearchResults | null): ResultGroup[] => {
  if (!results) return [];

  return [
    {
      key: "animals",
      heading: "Animals",
      rows: (results.animals ?? []).map(animalRow),
    },
    {
      key: "people",
      heading: "People",
      rows: (results.people ?? []).map(personRow),
    },
    {
      key: "partners",
      heading: "Partners",
      rows: (results.partners ?? []).map(partnerRow),
    },
    {
      key: "adoption-applications",
      heading: "Adoption applications",
      rows: (results.adoptionApplications ?? []).map(adoptionAppRow),
    },
    {
      key: "foster-applications",
      heading: "Foster applications",
      rows: (results.fosterApplications ?? []).map(fosterAppRow),
    },
  ].filter((group) => group.rows.length > 0);
};

interface CommandPaletteProps {
  navItems: PaletteNavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The ⌘K palette. Record groups come from `/api/search`, which decides what
 * this viewer may see; Pages are matched here against the nav items the layout
 * already filtered by permission, so an empty query still works as a keyboard
 * navigator without touching the network.
 *
 * Opened through `CommandPaletteProvider`, never rendered directly.
 */
export const CommandPalette = ({
  navItems,
  open,
  onOpenChange,
}: CommandPaletteProps) => {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  // Aborts the previous in-flight search whenever a newer one starts, so a slow
  // response can't overwrite the results for what the user has since typed.
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = async (searchQuery: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery)}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}.`);
      }
      const payload: GlobalSearchResults = await response.json();
      if (abortControllerRef.current !== controller) return;
      setResults(payload);
      setFailed(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error running global search:", error);
      if (abortControllerRef.current !== controller) return;
      setFailed(true);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsSearching(false);
      }
    }
  };

  const debouncedSearch = useDebouncedCallback(search, DEBOUNCE_MS);

  const resetSearch = useCallback(() => {
    debouncedSearch.cancel();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResults(null);
    setIsSearching(false);
    setFailed(false);
  }, [debouncedSearch]);

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
      abortControllerRef.current?.abort();
    };
  }, [debouncedSearch]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const trimmed = value.trim();
    // Below the floor there is nothing for the server to do: Pages match on
    // their own, and a one-letter query would match half the shelter anyway.
    if (trimmed.length < MIN_QUERY_LENGTH) {
      resetSearch();
      return;
    }
    debouncedSearch(trimmed);
  };

  const handleOpenChange = (next: boolean) => {
    // Every open starts from a blank query rather than resuming the last one.
    if (!next) {
      setQuery("");
      resetSearch();
    }
    onOpenChange(next);
  };

  const goTo = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const openInNewTab = (href: string) => {
    handleOpenChange(false);
    window.open(href, "_blank", "noopener,noreferrer");
  };

  // cmdk owns ↑/↓ and a plain Enter. ⌘/Ctrl+Enter is ours, and it reads the
  // href off the selected row: cmdk lowercases the value it tracks, so that
  // value can't be trusted as a URL. Preventing the default stops cmdk
  // handling the same Enter as an ordinary selection.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;

    const href = event.currentTarget.querySelector<HTMLElement>(
      '[cmdk-item][aria-selected="true"]',
    )?.dataset.href;
    if (!href) return;

    event.preventDefault();
    openInNewTab(href);
  };

  const trimmedQuery = query.trim();
  const needle = trimmedQuery.toLowerCase();
  const pageMatches = navItems.filter((item) =>
    item.title.toLowerCase().includes(needle),
  );

  const resultGroups = toResultGroups(results);

  const hasRows = pageMatches.length > 0 || resultGroups.length > 0;
  // Nothing to say before the user has typed, and no empty flash while the
  // first request for this query is still out.
  const showEmptyState =
    trimmedQuery.length > 0 && !hasRows && !failed && !isSearching;

  const renderRow = (href: string, children: ReactNode) => (
    <CommandItem
      key={href}
      // Unique per row, and never used for filtering — see `shouldFilter`.
      value={href}
      data-href={href}
      className="gap-3"
      onSelect={() => goTo(href)}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        openInNewTab(href);
      }}
    >
      {children}
    </CommandItem>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Search animals, people, partners and applications, or jump to a
            page.
          </DialogDescription>
        </DialogHeader>
        <Command
          className={COMMAND_SHELL}
          // Results arrive already filtered and ordered by the server, and
          // Pages are matched by hand above, so cmdk must not filter again — it
          // would score against the item value, which here is a URL.
          shouldFilter={false}
          onKeyDown={handleKeyDown}
        >
          <div className="relative">
            <CommandInput
              placeholder="Search animals, people, partners, applications…"
              value={query}
              onValueChange={handleQueryChange}
              maxLength={MAX_QUERY_LENGTH}
            />
            {isSearching && (
              <Loader2
                aria-hidden="true"
                className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
              />
            )}
          </div>
          <CommandList>
            {pageMatches.length > 0 && (
              <CommandGroup heading={groupHeading("Pages")}>
                {pageMatches.map((item) => {
                  const Icon = getIcon(item.icon);
                  return renderRow(
                    item.url,
                    <>
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </>,
                  );
                })}
              </CommandGroup>
            )}

            {resultGroups.map((group, index) => (
              <Fragment key={group.key}>
                {/* A rule between groups, so a heading can't be mistaken for the
                row above it. cmdk drops separators as soon as there is a
                query, which is exactly when these are needed. */}
                {(index > 0 || pageMatches.length > 0) && (
                  <CommandSeparator alwaysRender className="my-1" />
                )}
                <CommandGroup heading={groupHeading(group.heading)}>
                  {group.rows.map((row) =>
                    renderRow(
                      row.href,
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{row.primary}</p>
                          {row.secondary && (
                            <p className="text-muted-foreground truncate text-xs">
                              {row.secondary}
                            </p>
                          )}
                        </div>
                        {row.badge && (
                          <Badge variant="outline" className="shrink-0">
                            {row.badge}
                          </Badge>
                        )}
                      </>,
                    ),
                  )}
                </CommandGroup>
              </Fragment>
            ))}

            {/* Page matches still render above: only the record half failed. */}
            {failed && (
              <p
                role="status"
                className="text-muted-foreground px-4 py-3 text-sm"
              >
                Search failed. Try again.
              </p>
            )}

            {showEmptyState && (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No results for “{trimmedQuery}”
              </p>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
