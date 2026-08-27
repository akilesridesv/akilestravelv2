import { useEffect, useState } from "react";

/** Reactive media-query hook (SSR-safe-ish; assumes a browser at runtime). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

/** True on the split-view (desktop) breakpoint used across the provider UI. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 900px)");
}
