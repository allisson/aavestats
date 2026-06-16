"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { PositionBreakdown } from "@/lib/aave/breakdown";
import { fetchBreakdown, fetchSummary, type SummaryResult } from "./actions";
import { CascadePanel } from "@/components/CascadePanel";
import { Watchlist } from "@/components/Watchlist";
import {
  addWatch,
  getServerWatchlist,
  getWatchlist,
  removeWatch,
  subscribeWatchlist,
  watchKey,
  type WatchEntry,
} from "@/lib/watchlist";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function healthColor(hf: number | null): string {
  if (hf == null) return "text-neutral-400";
  if (hf < 1.1) return "text-red-400";
  if (hf < 1.5) return "text-amber-400";
  return "text-green-400";
}

export default function Home() {
  const entries = useSyncExternalStore(
    subscribeWatchlist,
    getWatchlist,
    getServerWatchlist,
  );
  const [summaries, setSummaries] = useState<Record<string, SummaryResult>>({});
  const [selected, setSelected] = useState<WatchEntry | null>(null);
  const [breakdown, setBreakdown] = useState<PositionBreakdown | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());

  // Fetch a lightweight summary for any watched address we don't have yet.
  // A missing summary renders as "loading"; setState only runs in the async
  // callback, never synchronously in the effect.
  useEffect(() => {
    for (const entry of entries) {
      const key = watchKey(entry);
      if (summaries[key] || inFlight.current.has(key)) continue;
      inFlight.current.add(key);
      fetchSummary(entry.chainId, entry.address).then((res) => {
        inFlight.current.delete(key);
        setSummaries((s) => ({ ...s, [key]: res }));
      });
    }
  }, [entries, summaries]);

  const load = useCallback(async (entry: WatchEntry, silent: boolean) => {
    setSelected(entry);
    setDetailError(null);
    if (silent) setRefreshing(true);
    else {
      setBreakdown(null);
      setDetailLoading(true);
    }
    const res = await fetchBreakdown(entry.chainId, entry.address);
    if (res.ok) {
      setBreakdown(res.breakdown);
      setFetchedAt(Date.now());
      // keep the watchlist badge consistent with the detail
      setSummaries((s) => ({
        ...s,
        [watchKey(entry)]: { ok: true, position: res.breakdown.position },
      }));
    } else {
      setDetailError(res.error);
    }
    setRefreshing(false);
    setDetailLoading(false);
  }, []);

  const select = useCallback((entry: WatchEntry) => load(entry, false), [load]);
  const refresh = () => {
    if (selected) load(selected, true);
  };

  function add(chainId: number, address: string) {
    const entry = { chainId, address };
    addWatch(entry);
    select(entry);
  }

  function remove(entry: WatchEntry) {
    const key = watchKey(entry);
    removeWatch(key);
    setSummaries((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
    if (selected && watchKey(selected) === key) {
      setSelected(null);
      setBreakdown(null);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">aavestats</h1>
        <p className="text-sm text-neutral-400">
          Watch Aave v3 positions and simulate liquidation scenarios.
        </p>
      </header>

      <Watchlist
        entries={entries}
        summaries={summaries}
        selectedKey={selected ? watchKey(selected) : null}
        onAdd={add}
        onSelect={select}
        onRemove={remove}
      />

      <div className="mt-10">
        {detailLoading && <p className="text-neutral-400">Reading position…</p>}
        {detailError && (
          <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {detailError}
          </p>
        )}
        {breakdown && (
          <section className="space-y-8">
            {fetchedAt && (
              <div className="flex justify-end">
                <Freshness
                  fetchedAt={fetchedAt}
                  onRefresh={refresh}
                  refreshing={refreshing}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-neutral-800 p-4 sm:grid-cols-4">
              <Stat
                label="Collateral"
                value={usd(breakdown.position.totalCollateralUsd)}
              />
              <Stat label="Debt" value={usd(breakdown.position.totalDebtUsd)} />
              <Stat
                label="Liq. threshold"
                value={`${(breakdown.position.liquidationThreshold * 100).toFixed(1)}%`}
              />
              <Stat
                label="Health factor"
                value={
                  breakdown.position.healthFactor != null
                    ? breakdown.position.healthFactor.toFixed(3)
                    : "∞"
                }
                className={healthColor(breakdown.position.healthFactor)}
              />
            </div>

            <CascadePanel breakdown={breakdown} />
          </section>
        )}
      </div>
    </main>
  );
}

function relativeTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function Freshness({
  fetchedAt,
  onRefresh,
  refreshing,
}: {
  fetchedAt: number;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  // Track "now" in state, updated only from the interval callback, so render
  // stays pure (no Date.now() during render).
  const [now, setNow] = useState(() => fetchedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 text-xs text-neutral-500">
      <span>Updated {relativeTime(Math.max(0, now - fetchedAt))}</span>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
      >
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg ${className ?? ""}`}>{value}</div>
    </div>
  );
}
