import type { HypotheticalItem } from "@/lib/aave/hypothetical";

/**
 * A saved Hypothetical Position — the *recipe* only (chain, E-Mode, per-asset
 * amounts), never the priced result. Prices are re-read live on open, the same
 * fresh-read-every-view model as a Watched Address (see ADR 0007 / 0001 / 0005).
 */
export type Hypothetical = {
  id: string;
  label: string;
  chainId: number;
  eModeCategory: number;
  items: HypotheticalItem[];
};

const STORAGE_KEY = "aavestats.hypotheticals";
const EMPTY: Hypothetical[] = [];

// External store over localStorage, consumed via useSyncExternalStore — mirrors
// watchlist.ts so reads are SSR-safe and writes avoid setState-in-effect.
let cache: Hypothetical[] | null = null;
const listeners = new Set<() => void>();

function read(): Hypothetical[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter(
      (h) =>
        typeof h?.id === "string" &&
        typeof h?.chainId === "number" &&
        Array.isArray(h?.items),
    );
  } catch {
    return EMPTY;
  }
}

function commit(next: Hypothetical[]): void {
  cache = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  listeners.forEach((l) => l());
}

export function subscribeHypotheticals(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable snapshot — the same reference until a mutation replaces it. */
export function getHypotheticals(): Hypothetical[] {
  if (cache === null) cache = read();
  return cache;
}

export function getServerHypotheticals(): Hypothetical[] {
  return EMPTY;
}

export function getHypothetical(id: string): Hypothetical | undefined {
  return getHypotheticals().find((h) => h.id === id);
}

export function saveHypothetical(h: Hypothetical): void {
  const list = getHypotheticals();
  const i = list.findIndex((x) => x.id === h.id);
  if (i === -1) commit([...list, h]);
  else commit(list.map((x) => (x.id === h.id ? h : x)));
}

export function removeHypothetical(id: string): void {
  commit(getHypotheticals().filter((h) => h.id !== id));
}
