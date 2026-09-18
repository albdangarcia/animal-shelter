import * as React from "react"

// Registry-declared dependency of components/ui/sidebar.tsx: `npx shadcn add
// sidebar --overwrite` silently rewrites this file back to a useState +
// useEffect version that fails react-hooks/set-state-in-effect. The
// useSyncExternalStore shape here is deliberate, not stylistic preference.
const MOBILE_BREAKPOINT = 768

// Helper to check the query status safely (won't crash on server)
const subscribe = (callback: () => void) => {
  if (typeof window === "undefined") return () => {}
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

const getSnapshot = () => {
  if (typeof window === "undefined") return false
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
}

const getServerSnapshot = () => {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )
}