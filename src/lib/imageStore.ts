// Binary media lives in IndexedDB, NOT in the persisted zustand/localStorage
// state. The app state only holds lightweight references ("idb:<id>"), so the
// serialized state stays tiny and fast. When Supabase Storage is wired later,
// refs become real URLs and `resolveImageSrc` returns them unchanged.

import { uid } from "@/lib/utils";

const DB_NAME = "akiles-media";
const STORE = "images";
const REF_PREFIX = "idb:";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}

// Cache object URLs by ref so we create each blob URL once and can revoke it.
const urlCache = new Map<string, string>();

export function isImageRef(ref: string): boolean {
  return ref.startsWith(REF_PREFIX);
}

/** Store a processed blob and return its reference. */
export async function putImage(blob: Blob): Promise<string> {
  const id = uid("img");
  const store = await tx("readwrite");
  await reqDone(store.put(blob, id));
  return REF_PREFIX + id;
}

/** Resolve a ref to a displayable src (cached object URL for local blobs). */
export async function resolveImageSrc(ref: string): Promise<string | undefined> {
  if (!isImageRef(ref)) return ref; // already a URL (e.g. future Supabase)
  if (urlCache.has(ref)) return urlCache.get(ref);
  const store = await tx("readonly");
  const blob = (await reqValue(store.get(ref.slice(REF_PREFIX.length)))) as Blob | undefined;
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urlCache.set(ref, url);
  return url;
}

/** Delete a stored image and free its cached object URL. */
export async function deleteImage(ref: string): Promise<void> {
  if (!isImageRef(ref)) return;
  const cached = urlCache.get(ref);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(ref);
  }
  const store = await tx("readwrite");
  await reqDone(store.delete(ref.slice(REF_PREFIX.length)));
}

export async function deleteImages(refs: string[]): Promise<void> {
  await Promise.all(refs.map(deleteImage));
}

function reqDone(req: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function reqValue(req: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
