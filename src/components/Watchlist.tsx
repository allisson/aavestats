"use client";

import { useState } from "react";
import { AAVE_CHAINS, getChain } from "@/lib/chains";
import type { SummaryResult } from "@/app/actions";
import { type WatchEntry, watchKey } from "@/lib/watchlist";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function healthColor(hf: number | null): string {
  if (hf == null) return "text-neutral-400";
  if (hf < 1.1) return "text-red-400";
  if (hf < 1.5) return "text-amber-400";
  return "text-green-400";
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
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <select
          value={chainId}
          onChange={(e) => setChainId(Number(e.target.value))}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
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
          placeholder="0x… wallet address to watch"
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={!valid}
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          Watch
        </button>
      </form>

      {entries.length > 0 && (
        <ul className="divide-y divide-neutral-900 rounded-lg border border-neutral-800">
          {entries.map((entry) => {
            const key = watchKey(entry);
            const state = summaries[key];
            const selected = key === selectedKey;
            return (
              <li
                key={key}
                className={`flex items-center gap-3 px-3 py-2 ${
                  selected ? "bg-neutral-900" : ""
                }`}
              >
                <button
                  onClick={() => onSelect(entry)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span className="w-20 shrink-0 text-xs text-neutral-500">
                    {getChain(entry.chainId)?.label ?? entry.chainId}
                  </span>
                  <span className="font-mono text-sm">
                    {short(entry.address)}
                  </span>
                  <span className="ml-auto text-right text-sm">
                    <SummaryBadge state={state} />
                  </span>
                </button>
                <button
                  onClick={() => onRemove(entry)}
                  aria-label="Remove"
                  className="shrink-0 text-neutral-600 hover:text-neutral-300"
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
  if (state === undefined) return <span className="text-neutral-600">…</span>;
  if (!state.ok)
    return (
      <span className="text-red-500" title={state.error}>
        error
      </span>
    );

  const { healthFactor, totalDebtUsd } = state.position;
  if (totalDebtUsd === 0)
    return <span className="text-neutral-500">no debt</span>;
  return (
    <span className={`font-mono ${healthColor(healthFactor)}`}>
      HF {healthFactor != null ? healthFactor.toFixed(2) : "∞"}
    </span>
  );
}
