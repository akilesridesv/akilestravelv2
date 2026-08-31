import { useSyncExternalStore } from "react";
import { getFavorites, isFavorite, subscribe, toggleFavorite } from "@/lib/favorites";

/** Reactive favorite state for a single experience. */
export function useFavorite(id: string) {
  const fav = useSyncExternalStore(
    subscribe,
    () => isFavorite(id),
    () => false
  );
  return { fav, toggle: () => toggleFavorite(id) };
}

/** All saved experience ids (reactive). */
export function useFavorites(): string[] {
  return useSyncExternalStore(subscribe, getFavorites, () => []);
}
