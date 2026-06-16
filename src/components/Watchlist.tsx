"use client";

import { useState } from "react";
import { AAVE_CHAINS, getChain } from "@/lib/chains";
import type { SummaryResult } from "@/app/actions";
import { type WatchEntry, watchKey } from "@/lib/watchlist";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function healthColor(hf: number | null): string {
  if (hf == null) return "text-mist";
  if (hf < 1.1) return "text-reef";
  if (hf < 1.5) return "text-shoal";
  return "text-clear";
}

export function Watchlist({
  entries,
  summaries,
  selectedKey,
  onAdd,
  onSelect,
  onRemove,
}: {
  entries: WatchEntry[];
  summaries: Record<string, SummaryResult>;
  selectedKey: string | null;
  onAdd: (chainId: number, address: string) => void;
  onSelect: (entry: WatchEntry) => void;
  onRemove: (entry: WatchEntry) => void;
}) {
  const [chainId, setChainId] = useState(42161);
  const [address, setAddress] = useState("");

  const valid = /^0x[a-fA-F0-9]{40}$/.test(address.trim());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onAdd(chainId, address.trim());
    setAddress("");
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-2">
        <div className="eyebrow">Watched addresses</div>
        <select
          value={chainId}
          onChange={(e) => setChainId(Number(e.target.value))}
          className="w-full rounded-lg border border-steel bg-deep px-3 py-2 text-sm text-bone"
        >
          {AAVE_CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… address to watch"
          className="w-full rounded-lg border border-steel bg-deep px-3 py-2 font-mono text-sm text-bone placeholder:text-mist/60"
        />
        <button
          type="submit"
          disabled={!valid}
          className="w-full rounded-lg bg-clear px-4 py-2 text-sm font-semibold text-abyss transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          Watch
        </button>
      </form>

      {entries.length > 0 && (
        <ul className="space-y-1.5">
          {entries.map((entry) => {
            const key = watchKey(entry);
            const state = summaries[key];
            const selected = key === selectedKey;
            return (
              <li
                key={key}
                className={`group flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                  selected
                    ? "border-clear/50 bg-shelf"
                    : "border-steel bg-deep/40 hover:bg-deep"
                }`}
              >
                <button
                  onClick={() => onSelect(entry)}
                  className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-bone">
                      {short(entry.address)}
                    </span>
                    <SummaryBadge state={state} />
                  </span>
                  <span className="eyebrow !tracking-wider">
                    {getChain(entry.chainId)?.label ?? entry.chainId}
                  </span>
                </button>
                <button
                  onClick={() => onRemove(entry)}
                  aria-label={`Remove ${short(entry.address)}`}
                  className="shrink-0 text-lg leading-none text-mist/50 opacity-0 transition-opacity hover:text-reef group-hover:opacity-100 focus-visible:opacity-100"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SummaryBadge({ state }: { state: SummaryResult | undefined }) {
  if (state === undefined)
    return <span className="font-mono text-sm text-mist/50">…</span>;
  if (!state.ok)
    return (
      <span className="font-mono text-xs text-reef" title={state.error}>
        error
      </span>
    );

  const { healthFactor, totalDebtUsd } = state.position;
  if (totalDebtUsd === 0)
    return <span className="font-mono text-xs text-mist">no debt</span>;
  return (
    <span className={`font-mono text-sm ${healthColor(healthFactor)}`}>
      {healthFactor != null ? healthFactor.toFixed(2) : "∞"}
    </span>
  );
}
