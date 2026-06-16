/** A wallet address being watched on a specific chain. */
export type WatchEntry = { chainId: number; address: string };

export const watchKey = (e: WatchEntry) =>
  `${e.chainId}:${e.address.toLowerCase()}`;

const STORAGE_KEY = "aavestats.watchlist";
const EMPTY: WatchEntry[] = [];

// Small external store over localStorage, consumed via useSyncExternalStore so
// reads are SSR-safe and writes don't require setState-in-effect.
let cache: WatchEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): WatchEntry[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter(
      (e) => typeof e?.chainId === "number" && typeof e?.address === "string",
    );
  } catch {
    return EMPTY;
  }
}

function commit(next: WatchEntry[]): void {
  cache = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  listeners.forEach((l) => l());
}

export function subscribeWatchlist(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable snapshot — the same reference until a mutation replaces it. */
export function getWatchlist(): WatchEntry[] {
  if (cache === null) cache = read();
  return cache;
}

export function getServerWatchlist(): WatchEntry[] {
  return EMPTY;
}

export function addWatch(entry: WatchEntry): void {
  const list = getWatchlist();
  if (list.some((e) => watchKey(e) === watchKey(entry))) return;
  commit([...list, entry]);
}

export function removeWatch(key: string): void {
  commit(getWatchlist().filter((e) => watchKey(e) !== key));
}
