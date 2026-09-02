// Lightweight per-browser favorites ("guardados"). No backend: stored in
// localStorage and shared across components via a tiny external store so every
// heart button stays in sync. Safe to use before the user has an account.

const KEY = "akiles:favorites";
type Listener = () => void;
const listeners = new Set<Listener>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr.filter((x) => typeof x === "string") as string[]) : [];
  } catch {
    return [];
  }
}

// Cached snapshot so useSyncExternalStore gets a stable reference between reads.
let cache: string[] = read();

function commit(ids: string[]) {
  cache = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* private mode / disabled storage — keep the in-memory cache */
  }
  listeners.forEach((l) => l());
}

// Optional write-through to the account (set on tourist login, cleared on
// logout). Keeps this module backend-free while syncing when signed in.
type SyncHandler = (id: string, on: boolean) => void;
let syncHandler: SyncHandler | null = null;
export function setFavoritesSync(fn: SyncHandler | null) {
  syncHandler = fn;
}

export function getFavorites(): string[] {
  return cache;
}

export function isFavorite(id: string): boolean {
  return cache.includes(id);
}

export function toggleFavorite(id: string) {
  const on = !cache.includes(id);
  commit(on ? [...cache, id] : cache.filter((x) => x !== id));
  syncHandler?.(id, on);
}

/** Replace the whole set (used to load the account's saved list on login). */
export function setFavorites(ids: string[]) {
  commit([...new Set(ids)]);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
