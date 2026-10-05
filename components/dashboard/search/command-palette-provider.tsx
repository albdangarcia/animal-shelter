"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  CommandPalette,
  type PaletteNavItem,
} from "@/components/dashboard/search/command-palette";

interface CommandPaletteContextValue {
  open: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

/**
 * Opens the ⌘K palette, or null where no provider is mounted. Null is the
 * permission gate rather than a mistake: the layout mounts the provider only
 * for viewers who hold a search permission, so a trigger that reads null
 * renders nothing and the header stays clean for everyone else.
 */
export const useCommandPalette = () => useContext(CommandPaletteContext);

// `opens` counts the times the palette has been opened. It keys the palette, so
// each open mounts a fresh one rather than resuming the last query and results.
type PaletteState = { open: boolean; opens: number };

const opened = (state: PaletteState): PaletteState =>
  state.open ? state : { open: true, opens: state.opens + 1 };

const closed = (state: PaletteState): PaletteState => ({
  ...state,
  open: false,
});

const toggled = (state: PaletteState) =>
  state.open ? closed(state) : opened(state);

interface CommandPaletteProviderProps {
  navItems: PaletteNavItem[];
  children: ReactNode;
}

/**
 * Holds the palette's open state and registers the ⌘K shortcut once, so the
 * keyboard and the header search bar drive the same dialog.
 *
 * `app/dashboard/layout.tsx` mounts this only for viewers who hold at least one
 * search permission — for everyone else there is no shortcut and no dialog.
 */
export const CommandPaletteProvider = ({
  navItems,
  children,
}: CommandPaletteProviderProps) => {
  const [{ open, opens }, setPalette] = useState<PaletteState>({
    open: false,
    opens: 0,
  });

  const contentRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Taken as an open is requested, while focus is still where the user left it.
  // A palette that is still on screen is one that is fading out, however it
  // was dismissed, and the reopen replaces it: what it was opened from stays
  // the target, since focus may already have gone to the page by now.
  const rememberFocus = () => {
    if (contentRef.current) return;
    const active = document.activeElement;
    returnFocusRef.current = active instanceof HTMLElement ? active : null;
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // A modifier means this still fires while focus sits in a form field.
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      rememberFocus();
      setPalette(toggled);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Not wrapped in useMemo: `reactCompiler` is on, so the compiler keeps this
  // object stable between renders on its own.
  const value = {
    open: () => {
      rememberFocus();
      setPalette(opened);
    },
  };

  return (
    // React 19 renders the context itself as the provider; `.Provider` is
    // deprecated.
    <CommandPaletteContext value={value}>
      {children}
      <CommandPalette
        key={opens}
        navItems={navItems}
        open={open}
        onOpenChange={(next) => setPalette(next ? opened : closed)}
        contentRef={contentRef}
        returnFocusRef={returnFocusRef}
      />
    </CommandPaletteContext>
  );
};
