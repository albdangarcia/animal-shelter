import { useSyncExternalStore } from "react";

// A stand-in for next/navigation in component tests. A test file that renders a
// widget reading or changing the URL mocks the module with one line:
//
//   vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));
//
// and calls `resetNavigation(href)` in `beforeEach`. `setUrl` is a navigation
// the widget did not cause (another control's Reset, a back button);
// `currentUrl()` and `routerCalls` read what the widget wrote.
//
// It exports only what the widgets under test import. A widget that needs
// another export fails loudly ("does not provide an export named …"): add it
// here then.

// The URL is a store, not a value each hook reads once: the bug class these
// tests guard is a control that keeps showing a stale value after the URL has
// moved on without it, so every reader has to re-render when the URL changes,
// whoever changed it. useSyncExternalStore gives that, as the real router's
// context does.
let current = new URL("http://localhost/");
let params = readonlyParams(current.search);
const listeners = new Set<() => void>();

// The search params are one object until the search string changes, because
// useSyncExternalStore compares snapshots by identity: a new object on every
// read would re-render forever. Next hands out a ReadonlyURLSearchParams, so
// a widget that edits the hook's object instead of a copy throws here too.
function readonlyParams(search: string) {
  const readonly = new URLSearchParams(search);
  for (const method of ["append", "delete", "set", "sort"] as const) {
    readonly[method] = () => {
      throw new Error(`useSearchParams() is read-only: copy it before ${method}`);
    };
  }
  return readonly;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** An outside navigation: every widget reading the URL re-renders. */
export function setUrl(href: string) {
  const next = new URL(href, current);
  if (next.search !== current.search) params = readonlyParams(next.search);
  current = next;
  listeners.forEach((listener) => listener());
}

/** The pathname plus the search string, as `/pets?query=bud&page=1`. */
export const currentUrl = () => current.pathname + current.search;

/** Every router call, in order. `href` is empty for back, forward and refresh. */
export const routerCalls: { method: string; href: string }[] = [];

/** Empties `routerCalls` and sets the URL. Call it in `beforeEach`. */
export function resetNavigation(href = "/") {
  routerCalls.length = 0;
  setUrl(href);
}

// push and replace both change the URL, as the real ones do: the widgets read
// their state back from it, so a fake that only recorded the call would leave
// every control showing the old value. The two differ only in the back stack,
// which this fake does not keep; `routerCalls` says which one a widget used.
const router = {
  push: (href: string) => {
    routerCalls.push({ method: "push", href });
    setUrl(href);
  },
  replace: (href: string) => {
    routerCalls.push({ method: "replace", href });
    setUrl(href);
  },
  back: () => routerCalls.push({ method: "back", href: "" }),
  forward: () => routerCalls.push({ method: "forward", href: "" }),
  refresh: () => routerCalls.push({ method: "refresh", href: "" }),
  prefetch: () => {},
};

export const useRouter = () => router;

export const usePathname = () =>
  useSyncExternalStore(subscribe, () => current.pathname);

export const useSearchParams = () => useSyncExternalStore(subscribe, () => params);
