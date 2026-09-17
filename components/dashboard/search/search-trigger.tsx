"use client";

import { useSyncExternalStore } from "react";
import { IconSearch } from "@tabler/icons-react";

import { useCommandPalette } from "@/components/dashboard/search/command-palette-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The platform can't change under a mounted page, so there is nothing to
// subscribe to — only a snapshot the server has no way to take.
const subscribe = () => () => {};

const getSnapshot = () => /mac/i.test(navigator.userAgent);

// Rendered as ⌘K until the client can look. React re-renders with the real
// snapshot after hydration, so the markup and the first paint always agree.
const getServerSnapshot = () => true;

/** The shortcut hint, as the viewer's own keyboard spells it. */
const useShortcutLabel = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    ? "⌘K"
    : "Ctrl K";

/**
 * Opens the ⌘K palette. Styled as a search field rather than a plain button,
 * but it is a real `<button>`: typing always happens inside the palette, never
 * here. It shrinks to a square icon on phones, where the header is the only
 * chrome there is — the sidebar has become a drawer by then, which is why this
 * lives here and not in it.
 *
 * Renders nothing when no palette is mounted, which is the permission gate.
 */
export const SearchTrigger = ({ className }: { className?: string }) => {
  const palette = useCommandPalette();
  const shortcut = useShortcutLabel();

  if (!palette) return null;

  return (
    <Button
      variant="outline"
      onClick={palette.open}
      // The visible text is decorative here: this keeps one stable name at
      // every width, including the icon-only one.
      aria-label="Search"
      className={cn(
        "text-muted-foreground size-8 justify-center p-0 font-normal",
        "sm:w-56 sm:justify-start sm:gap-2 sm:px-3",
        "hover:text-foreground",
        className,
      )}
    >
      <IconSearch aria-hidden="true" className="size-4" />
      <span aria-hidden="true" className="hidden sm:inline">
        Search…
      </span>
      <kbd
        aria-hidden="true"
        className="text-muted-foreground bg-muted ml-auto hidden rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline-block"
      >
        {shortcut}
      </kbd>
    </Button>
  );
};
