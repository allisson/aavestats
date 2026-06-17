"use client";

import { useState } from "react";
import { AAVE_CHAINS, getChain } from "@/lib/chains";
import type { SummaryResult } from "@/app/actions";
import { type WatchEntry, watchKey } from "@/lib/watchlist";
import type { Hypothetical } from "@/lib/hypotheticals";

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
  hypotheticals,
  selectedHypotheticalId,
  onNewHypothetical,
  onSelectHypothetical,
  onRemoveHypothetical,
}: {
  entries: WatchEntry[];
  summaries: Record<string, SummaryResult>;
  selectedKey: string | null;
  onAdd: (chainId: number, address: string) => void;
  onSelect: (entry: WatchEntry) => void;
  onRemove: (entry: WatchEntry) => void;
  hypotheticals: Hypothetical[];
  selectedHypotheticalId: string | null;
  onNewHypothetical: (chainId: number) => void;
  onSelectHypothetical: (id: string) => void;
  onRemoveHypothetical: (id: string) => void;
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
        <button
          type="button"
          onClick={() => onNewHypothetical(chainId)}
          className="w-full rounded-lg border border-steel px-4 py-2 text-sm text-bone transition-colors hover:bg-shelf"
        >
          + New hypothetical position
        </button>
      </form>

      {hypotheticals.length > 0 && (
        <div className="space-y-1.5">
          <div className="eyebrow">Hypothetical positions</div>
          <ul className="space-y-1.5">
            {hypotheticals.map((h) => {
              const selected = h.id === selectedHypotheticalId;
              return (
                <li
                  key={h.id}
                  className={`group flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                    selected
                      ? "border-clear/50 bg-shelf"
                      : "border-steel bg-deep/40 hover:bg-deep"
                  }`}
                >
                  <button
                    onClick={() => onSelectHypothetical(h.id)}
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-bone">
                        {h.label || "Untitled"}
                      </span>
                      <span className="shrink-0 rounded-sm border border-steel px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-mist">
                        hyp.
                      </span>
                    </span>
                    <span className="eyebrow !tracking-wider">
                      {getChain(h.chainId)?.label ?? h.chainId}
                    </span>
                  </button>
                  <button
                    onClick={() => onRemoveHypothetical(h.id)}
                    aria-label={`Remove ${h.label || "hypothetical"}`}
                    className="shrink-0 text-lg leading-none text-mist/50 opacity-0 transition-opacity hover:text-reef group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

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

const HEALTH_FILL = {
  reef: "var(--color-reef)",
  shoal: "var(--color-shoal)",
  clear: "var(--color-clear)",
} as const;

function healthFill(hf: number | null): string {
  if (hf == null || hf >= 1.5) return HEALTH_FILL.clear;
  if (hf < 1.1) return HEALTH_FILL.reef;
  return HEALTH_FILL.shoal;
}

/** A row-scale echo of the sounding gauge: depth = 1/HF above the waterline. */
function DepthTick({ hf }: { hf: number | null }) {
  const top = 2;
  const bottom = 30;
  const frac = hf == null ? 0 : Math.min(1 / hf, 1.12);
  const y = Math.min(bottom + 4, top + frac * (bottom - top));
  const color = healthFill(hf);
  return (
    <svg width={9} height={34} viewBox="0 0 9 34" aria-hidden="true">
      <line
        x1={4.5}
        x2={4.5}
        y1={top}
        y2={bottom}
        stroke="var(--color-steel)"
        strokeWidth={1}
      />
      <line
        x1={1}
        x2={8}
        y1={bottom}
        y2={bottom}
        stroke="var(--color-reef)"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <circle cx={4.5} cy={y} r={2.5} fill={color} />
    </svg>
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
    <span className="flex items-center gap-1.5">
      <DepthTick hf={healthFactor} />
      <span className={`font-mono text-sm ${healthColor(healthFactor)}`}>
        {healthFactor != null ? healthFactor.toFixed(2) : "∞"}
      </span>
    </span>
  );
}
