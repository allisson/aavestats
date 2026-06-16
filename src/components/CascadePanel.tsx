"use client";

import { useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PositionBreakdown } from "@/lib/aave/breakdown";
import {
  assetLiquidationPrice,
  debtLiquidationPrice,
  simulateCascade,
  sweepScenario,
} from "@/lib/simulation/cascade";

const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const price = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4,
  });

const amt = (n: number) =>
  n.toLocaleString("en-US", {
    maximumFractionDigits: n >= 1000 ? 2 : n >= 1 ? 4 : 6,
  });

export function CascadePanel({ breakdown }: { breakdown: PositionBreakdown }) {
  const collateralAssets = useMemo(
    () =>
      [...breakdown.assets]
        .filter((a) => a.collateralUsd > 0)
        .sort((a, b) => b.collateralUsd - a.collateralUsd),
    [breakdown],
  );
  // Debt-only assets get a "price rises" slider; assets that are also collateral
  // are driven by their collateral slider (one price per asset).
  const debtAssets = useMemo(
    () =>
      [...breakdown.assets]
        .filter((a) => a.debtUsd > 0 && a.collateralUsd === 0)
        .sort((a, b) => b.debtUsd - a.debtUsd),
    [breakdown],
  );
  const hasDebt = breakdown.assets.some((a) => a.debtUsd > 0);

  // asset address -> price multiplier (1 = unchanged). Only non-1 values stored.
  const [shocks, setShocks] = useState<Record<string, number>>({});
  const mult = (asset: string) => shocks[asset] ?? 1;
  const setMult = (asset: string, m: number) =>
    setShocks((s) => {
      const next = { ...s };
      if (m === 1) delete next[asset];
      else next[asset] = m;
      return next;
    });

  const sweep = useMemo(
    () =>
      sweepScenario(breakdown, shocks).map((p) => ({
        intensityPct: p.intensityPct,
        hf:
          p.healthFactorBefore != null
            ? Number(p.healthFactorBefore.toFixed(3))
            : null,
      })),
    [breakdown, shocks],
  );

  const result = useMemo(
    () => simulateCascade(breakdown, shocks),
    [breakdown, shocks],
  );

  const anyChange = Object.keys(shocks).length > 0;

  return (
    <div className="space-y-8">
      {!breakdown.reconciles ? (
        <p className="rounded border border-amber-900 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
          Per-asset reconstruction does not match Aave&apos;s aggregate, so the
          cascade below may differ from Aave&apos;s effective values. The
          summary above (read from Aave directly) remains accurate.
        </p>
      ) : (
        breakdown.eModeCategory > 0 && (
          <p className="rounded border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-400">
            E-Mode category {breakdown.eModeCategory} active — the
            category&apos;s boosted liquidation thresholds are applied below.
          </p>
        )
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-300">Assets</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500">
              <tr className="border-b border-neutral-800 text-left">
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2 text-right">Collateral</th>
                <th className="px-3 py-2 text-right">Debt</th>
                <th className="px-3 py-2 text-right">Liq. threshold</th>
                <th className="px-3 py-2 text-right">Liq. bonus</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.assets.map((a) => (
                <tr key={a.asset} className="border-b border-neutral-900">
                  <td className="px-3 py-2 font-medium">{a.symbol}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {a.collateralUsd > 0 ? (
                      <>
                        <div>{usd(a.collateralUsd)}</div>
                        <div className="text-xs text-neutral-500">
                          {amt(a.collateralAmount)} {a.symbol}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {a.debtUsd > 0 ? (
                      <>
                        <div>{usd(a.debtUsd)}</div>
                        <div className="text-xs text-neutral-500">
                          {amt(a.debtAmount)} {a.symbol}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-400">
                    {(a.liquidationThreshold * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-400">
                    {a.collateralUsd > 0
                      ? `${(a.liquidationBonus * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!hasDebt ? (
        <p className="text-neutral-400">
          This position has no debt, so it cannot be liquidated.
        </p>
      ) : collateralAssets.length === 0 ? (
        <p className="text-neutral-400">No collateral to simulate against.</p>
      ) : (
        <section className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-300">
              Scenario — shock prices
            </h2>
            {anyChange && (
              <button
                onClick={() => setShocks({})}
                className="text-xs text-neutral-500 hover:text-neutral-300"
              >
                Reset
              </button>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Collateral falls
            </p>
            {collateralAssets.map((a) => {
              const drop = 1 - mult(a.asset);
              const liq = assetLiquidationPrice(breakdown, a.asset);
              return (
                <ShockRow
                  key={a.asset}
                  symbol={a.symbol}
                  from={a.priceUsd}
                  to={a.priceUsd * (1 - drop)}
                  pct={Math.round(drop * 100)}
                  sign="-"
                  max={90}
                  onChange={(p) => setMult(a.asset, 1 - p / 100)}
                  note={
                    liq === "safe-alone"
                      ? "Won't trigger liquidation falling alone"
                      : liq && liq.dropFraction > 0
                        ? `Liquidates at ${price(liq.price)} (−${(liq.dropFraction * 100).toFixed(0)}%) if it falls alone`
                        : "Already at liquidation level"
                  }
                />
              );
            })}
          </div>

          {debtAssets.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Debt rises
              </p>
              {debtAssets.map((a) => {
                const rise = mult(a.asset) - 1;
                const liq = debtLiquidationPrice(breakdown, a.asset);
                return (
                  <ShockRow
                    key={a.asset}
                    symbol={a.symbol}
                    from={a.priceUsd}
                    to={a.priceUsd * (1 + rise)}
                    pct={Math.round(rise * 100)}
                    sign="+"
                    max={200}
                    onChange={(p) => setMult(a.asset, 1 + p / 100)}
                    note={
                      liq === "already"
                        ? "Already at liquidation level"
                        : liq === "safe-alone"
                          ? "Won't trigger liquidation rising alone"
                          : liq
                            ? `Liquidates at ${price(liq.price)} (+${(liq.riseFraction * 100).toFixed(0)}%) if it rises alone`
                            : ""
                    }
                  />
                );
              })}
            </div>
          )}

          <div>
            <p className="mb-1 text-xs text-neutral-500">
              Health factor as this scenario unfolds (0% = today, 100% = the
              shocks above), running the full liquidation cascade at each step.
            </p>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={sweep}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                >
                  <XAxis
                    dataKey="intensityPct"
                    stroke="#666"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    stroke="#666"
                    tick={{ fontSize: 12 }}
                    domain={[0, "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#171717",
                      border: "1px solid #333",
                    }}
                    labelFormatter={(v) => `Scenario intensity: ${v}%`}
                    formatter={(v) => [v, "Health factor (pre-liquidation)"]}
                  />
                  <ReferenceLine y={1} stroke="#ef4444" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="hf"
                    stroke="#22c55e"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <CascadeResultView result={result} active={anyChange} />
        </section>
      )}
    </div>
  );
}

function ShockRow({
  symbol,
  from,
  to,
  pct,
  sign,
  max,
  onChange,
  note,
}: {
  symbol: string;
  from: number;
  to: number;
  pct: number;
  sign: "+" | "-";
  max: number;
  onChange: (pct: number) => void;
  note: string;
}) {
  return (
    <div className="space-y-1 py-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{symbol}</span>
        <span className="font-mono text-xs text-neutral-400">
          {price(from)} → {price(to)}
          <span className="ml-2 text-neutral-500">
            {sign}
            {pct}%
          </span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      {note && <p className="text-xs text-neutral-500">{note}</p>}
    </div>
  );
}

function CascadeResultView({
  result,
  active,
}: {
  result: ReturnType<typeof simulateCascade>;
  active: boolean;
}) {
  const hfBefore = result.healthFactorBefore;
  const liquidatable = hfBefore != null && hfBefore < 1;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 p-4">
      <p className="text-sm">
        Health factor at these prices:{" "}
        <span
          className={`font-mono ${liquidatable ? "text-red-400" : "text-green-400"}`}
        >
          {hfBefore != null ? hfBefore.toFixed(3) : "∞"}
        </span>
        {!liquidatable && (
          <span className="ml-2 text-neutral-500">
            — {active ? "no liquidation" : "drag a slider to shock a price"}
          </span>
        )}
      </p>

      {result.events.length > 0 && (
        <ol className="space-y-1 text-sm">
          {result.events.map((e) => (
            <li key={e.step} className="text-neutral-300">
              <span className="text-neutral-500">#{e.step}</span> HF{" "}
              {e.healthFactorBefore.toFixed(3)} → repay{" "}
              <span className="font-mono">{usd(e.debtRepaidUsd)}</span>{" "}
              {e.debtSymbol} ({(e.closeFactor * 100).toFixed(0)}% close factor),
              seize{" "}
              <span className="font-mono">{usd(e.collateralSeizedUsd)}</span>{" "}
              {e.collateralSymbol} (+{(e.bonus * 100).toFixed(1)}% bonus)
            </li>
          ))}
        </ol>
      )}

      {liquidatable && (
        <p className="text-sm text-neutral-400">
          After {result.events.length} liquidation
          {result.events.length === 1 ? "" : "s"}: collateral{" "}
          <span className="font-mono">{usd(result.finalCollateralUsd)}</span>,
          debt <span className="font-mono">{usd(result.finalDebtUsd)}</span>,
          health factor{" "}
          <span className="font-mono">
            {result.finalHealthFactor == null
              ? "∞"
              : result.finalHealthFactor.toFixed(3)}
          </span>
          {result.insolvent && (
            <span className="ml-2 text-red-400">
              — collateral exhausted with debt remaining (bad debt)
            </span>
          )}
        </p>
      )}
    </div>
  );
}
