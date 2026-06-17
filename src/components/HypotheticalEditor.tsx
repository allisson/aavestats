"use client";

import { useMemo, useState } from "react";
import { getChain } from "@/lib/chains";
import type { ReserveCatalog } from "@/lib/aave/catalog";
import {
  buildHypotheticalBreakdown,
  type HypotheticalItem,
} from "@/lib/aave/hypothetical";
import { CascadePanel } from "@/components/CascadePanel";
import { Hero } from "@/components/Hero";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const price = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4,
  });

function healthColor(hf: number | null): string {
  if (hf == null) return "text-mist";
  if (hf < 1.1) return "text-reef";
  if (hf < 1.5) return "text-shoal";
  return "text-clear";
}

/** Initial state for the editor; amounts are numbers (0 = blank). */
export type EditorSeed = {
  label: string;
  eModeCategory: number;
  items: HypotheticalItem[];
};

/** Editor row: amounts held as strings so the inputs can be cleared/typed. */
type Row = { asset: string; collateral: string; debt: string };

const toNum = (s: string) => Math.max(0, Number(s) || 0);
const fromAmount = (n: number) => (n > 0 ? String(n) : "");

export function HypotheticalEditor({
  catalog,
  seed,
  onSave,
  onDelete,
  onClose,
}: {
  catalog: ReserveCatalog;
  seed: EditorSeed;
  onSave: (recipe: {
    label: string;
    eModeCategory: number;
    items: HypotheticalItem[];
  }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(seed.label);
  const [eModeCategory, setEModeCategory] = useState(seed.eModeCategory);
  const [rows, setRows] = useState<Row[]>(() =>
    seed.items.map((i) => ({
      asset: i.asset,
      collateral: fromAmount(i.collateralAmount),
      debt: fromAmount(i.debtAmount),
    })),
  );

  const reserveByAddr = useMemo(
    () => new Map(catalog.reserves.map((r) => [r.asset.toLowerCase(), r])),
    [catalog],
  );

  const items: HypotheticalItem[] = useMemo(
    () =>
      rows.map((r) => ({
        asset: r.asset,
        collateralAmount: toNum(r.collateral),
        debtAmount: toNum(r.debt),
      })),
    [rows],
  );

  const breakdown = useMemo(
    () => buildHypotheticalBreakdown(catalog, { eModeCategory, items }),
    [catalog, eModeCategory, items],
  );

  const chainLabel = getChain(catalog.chainId)?.label ?? catalog.chainId;
  const used = new Set(rows.map((r) => r.asset.toLowerCase()));
  const addable = catalog.reserves
    .filter((r) => !used.has(r.asset.toLowerCase()))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const addRow = (asset: string) =>
    setRows((rs) => [...rs, { asset, collateral: "", debt: "" }]);
  const removeRow = (asset: string) =>
    setRows((rs) => rs.filter((r) => r.asset !== asset));
  const setRow = (asset: string, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => (r.asset === asset ? { ...r, ...patch } : r)),
    );

  const canSave = label.trim().length > 0;
  const save = () =>
    onSave({
      label: label.trim(),
      eModeCategory,
      // Drop empty rows on save so the persisted recipe stays clean.
      items: items.filter((i) => i.collateralAmount > 0 || i.debtAmount > 0),
    });

  return (
    <div className="space-y-8">
      <section className="space-y-5 rounded-xl border border-steel bg-deep/40 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="eyebrow" htmlFor="hyp-label">
              Hypothetical position · {chainLabel}
            </label>
            <input
              id="hyp-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name this position"
              className="w-full rounded-lg border border-steel bg-deep px-3 py-2 text-sm text-bone placeholder:text-mist/60"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded-lg border border-steel px-3 py-2 text-sm text-mist transition-colors hover:border-reef/50 hover:text-reef"
              >
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-steel px-3 py-2 text-sm text-bone transition-colors hover:bg-shelf"
            >
              Close
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className="rounded-lg bg-clear px-4 py-2 text-sm font-semibold text-abyss transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              Save
            </button>
          </div>
        </div>

        {catalog.eModeCategories.length > 0 && (
          <div className="space-y-1">
            <label className="eyebrow" htmlFor="hyp-emode">
              E-Mode
            </label>
            <select
              id="hyp-emode"
              value={eModeCategory}
              onChange={(e) => setEModeCategory(Number(e.target.value))}
              className="w-full rounded-lg border border-steel bg-deep px-3 py-2 text-sm text-bone sm:w-64"
            >
              <option value={0}>None</option>
              {catalog.eModeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  Category {c.id} — LT{" "}
                  {(c.liquidationThresholdBps / 100).toFixed(1)}%
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-steel">
          <table className="w-full text-sm">
            <thead className="eyebrow">
              <tr className="border-b border-steel text-left">
                <th className="px-4 py-2.5 font-normal">Asset</th>
                <th className="px-4 py-2.5 text-right font-normal">
                  Collateral (amount)
                </th>
                <th className="px-4 py-2.5 text-right font-normal">
                  Debt (amount)
                </th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-mist"
                  >
                    Add an asset to start building a position.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const res = reserveByAddr.get(r.asset.toLowerCase());
                  return (
                    <tr
                      key={r.asset}
                      className="border-b border-steel/50 last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-bone">
                          {res?.symbol ?? "?"}
                        </div>
                        {res && (
                          <div className="text-xs text-mist">
                            {price(res.priceUsd)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountInput
                          value={r.collateral}
                          onChange={(v) => setRow(r.asset, { collateral: v })}
                          label={`${res?.symbol ?? ""} collateral amount`}
                        />
                        <Hint
                          usd={toNum(r.collateral) * (res?.priceUsd ?? 0)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <AmountInput
                          value={r.debt}
                          onChange={(v) => setRow(r.asset, { debt: v })}
                          label={`${res?.symbol ?? ""} debt amount`}
                        />
                        <Hint usd={toNum(r.debt) * (res?.priceUsd ?? 0)} />
                      </td>
                      <td className="px-2 py-3 text-right">
                        <button
                          onClick={() => removeRow(r.asset)}
                          aria-label={`Remove ${res?.symbol ?? "asset"}`}
                          className="text-lg leading-none text-mist/50 transition-colors hover:text-reef"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {addable.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value=""
              onChange={(e) => e.target.value && addRow(e.target.value)}
              className="rounded-lg border border-steel bg-deep px-3 py-2 text-sm text-bone"
              aria-label="Add an asset"
            >
              <option value="">+ Add asset…</option>
              {addable.map((r) => (
                <option key={r.asset} value={r.asset}>
                  {r.symbol}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {breakdown.position.totalCollateralUsd > 0 &&
        breakdown.position.totalDebtUsd > 0 && <Hero breakdown={breakdown} />}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-steel bg-steel sm:grid-cols-4">
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

      <CascadePanel breakdown={breakdown} hideAssets />
    </div>
  );
}

function AmountInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="number"
      min={0}
      step="any"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      aria-label={label}
      className="w-32 rounded-md border border-steel bg-deep px-2 py-1.5 text-right font-mono text-sm text-bone placeholder:text-mist/40"
    />
  );
}

function Hint({ usd: value }: { usd: number }) {
  if (value <= 0) return null;
  return <div className="mt-1 text-xs text-mist">{usd(value)}</div>;
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
