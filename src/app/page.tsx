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
import { Hero } from "@/components/Hero";
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
  if (hf == null) return "text-mist";
  if (hf < 1.1) return "text-reef";
  if (hf < 1.5) return "text-shoal";
  return "text-clear";
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
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-8 flex items-end justify-between gap-4 border-b border-steel pb-5">
        <div>
          <h1 className="font-mono text-xl font-semibold tracking-tight">
            aavestats
          </h1>
          <p className="mt-1 text-sm text-mist">
            Sound an Aave v3 position&apos;s distance to liquidation.
          </p>
        </div>
        <div className="eyebrow hidden text-right leading-relaxed sm:block">
          Aave Oracle prices
          <br />
          live on-chain reads
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[19rem_1fr]">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Watchlist
            entries={entries}
            summaries={summaries}
            selectedKey={selected ? watchKey(selected) : null}
            onAdd={add}
            onSelect={select}
            onRemove={remove}
          />
        </aside>

        <main className="min-w-0">
          {detailLoading && <p className="text-mist">Taking a sounding…</p>}
          {detailError && (
            <p className="rounded-lg border border-reef/40 bg-reef/10 px-4 py-3 text-sm text-reef">
              {detailError}
            </p>
          )}
          {!detailLoading && !detailError && !breakdown && (
            <EmptyState hasEntries={entries.length > 0} />
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
              <Hero breakdown={breakdown} />

              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-steel bg-steel sm:grid-cols-4">
                <Stat
                  label="Collateral"
                  value={usd(breakdown.position.totalCollateralUsd)}
                />
                <Stat
                  label="Debt"
                  value={usd(breakdown.position.totalDebtUsd)}
                />
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
        </main>
      </div>
    </div>
  );
}

function EmptyState({ hasEntries }: { hasEntries: boolean }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-steel px-6 py-16 text-center">
      <div className="font-mono text-3xl text-steel">≈≈≈</div>
      <p className="mt-4 max-w-xs text-sm text-mist">
        {hasEntries
          ? "Select a watched address to take a sounding."
          : "Add a watched address to take a sounding of its distance to liquidation."}
      </p>
    </div>
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
    <div className="flex items-center gap-3 text-xs text-mist">
      <span>Updated {relativeTime(Math.max(0, now - fetchedAt))}</span>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="rounded-md border border-steel px-2.5 py-1 text-bone transition-colors hover:bg-shelf disabled:opacity-40"
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
    <div className="bg-abyss px-4 py-3.5">
      <div className="eyebrow">{label}</div>
      <div className={`mt-1.5 font-mono text-lg ${className ?? "text-bone"}`}>
        {value}
      </div>
    </div>
  );
}
