"use client";

import { useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PositionBreakdown } from "@/lib/aave/breakdown";
import {
  assetLiquidationPrice,
  bindingMoveAssets,
  debtLiquidationPrice,
  distanceToLiquidation,
  simulateCascade,
  sweepCrash,
  sweepScenario,
  type PriceShocks,
} from "@/lib/simulation/cascade";

// Shared chart colors, pulled from the design tokens in globals.css.
const C = {
  axis: "#7c95a0", // mist
  grid: "#1b3a48", // steel
  panel: "#0c2430", // deep
  trace: "#2fd6ae", // clear
  reef: "#ff5c4d", // reef
  now: "#7c95a0", // mist
};

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

export function CascadePanel({
  breakdown,
  hideAssets = false,
}: {
  breakdown: PositionBreakdown;
  hideAssets?: boolean;
}) {
  const hasDebt = breakdown.assets.some((a) => a.debtUsd > 0);
  const hasCollateral = breakdown.assets.some((a) => a.collateralUsd > 0);
  const distance = useMemo(() => distanceToLiquidation(breakdown), [breakdown]);

  return (
    <div className="space-y-8">
      {!breakdown.reconciles ? (
        <p className="rounded-lg border border-shoal/40 bg-shoal/10 px-4 py-3 text-sm text-shoal">
          Per-asset reconstruction does not match Aave&apos;s aggregate, so the
          cascade below may differ from Aave&apos;s effective values. The
          summary above (read from Aave directly) remains accurate.
        </p>
      ) : (
        breakdown.eModeCategory > 0 && (
          <p className="rounded-lg border border-steel bg-deep/50 px-4 py-3 text-sm text-mist">
            E-Mode category {breakdown.eModeCategory} active — the
            category&apos;s boosted liquidation thresholds are applied below.
          </p>
        )
      )}

      {!hideAssets && <AssetsTable breakdown={breakdown} />}

      {!hasDebt ? (
        <p className="text-mist">
          This position has no debt, so it cannot be liquidated.
        </p>
      ) : !hasCollateral ? (
        <p className="text-mist">No collateral to simulate against.</p>
      ) : (
        <section className="space-y-6">
          <SectionTitle>Scenario</SectionTitle>

          {distance.kind === "collateral-fall" ? (
            <DefaultScenario
              breakdown={breakdown}
              direction="collateral-fall"
              triggerFraction={distance.dropFraction}
            />
          ) : distance.kind === "debt-rise" ? (
            <DefaultScenario
              breakdown={breakdown}
              direction="debt-rise"
              triggerFraction={distance.riseFraction}
            />
          ) : distance.kind === "eligible-now" ? (
            <div className="space-y-3">
              <p className="text-sm text-shoal">
                Already eligible for liquidation at current prices — the cascade
                below runs from here.
              </p>
              <CascadeOutcome result={simulateCascade(breakdown, {})} />
            </div>
          ) : (
            <p className="text-sm text-mist">
              No single volatile price move brings this position to liquidation.
              Use the custom scenario below to combine moves.
            </p>
          )}

          <AdvancedScenario breakdown={breakdown} />
        </section>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-sm font-semibold text-bone">
      {children}
      <span className="h-px flex-1 bg-steel" />
    </h2>
  );
}

function AssetsTable({ breakdown }: { breakdown: PositionBreakdown }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-bone">Assets</h2>
      <div className="overflow-x-auto rounded-xl border border-steel">
        <table className="w-full text-sm">
          <thead className="eyebrow">
            <tr className="border-b border-steel text-left">
              <th className="px-4 py-2.5 font-normal">Asset</th>
              <th className="px-4 py-2.5 text-right font-normal">Collateral</th>
              <th className="px-4 py-2.5 text-right font-normal">Debt</th>
              <th className="px-4 py-2.5 text-right font-normal">
                Liq. threshold
              </th>
              <th className="px-4 py-2.5 text-right font-normal">Liq. bonus</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.assets.map((a) => (
              <tr
                key={a.asset}
                className="border-b border-steel/50 last:border-b-0"
              >
                <td className="px-4 py-3 font-medium text-bone">{a.symbol}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {a.collateralUsd > 0 ? (
                    <>
                      <div className="text-bone">{usd(a.collateralUsd)}</div>
                      <div className="text-xs text-mist">
                        {amt(a.collateralAmount)} {a.symbol}
                      </div>
                    </>
                  ) : (
                    <span className="text-mist/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {a.debtUsd > 0 ? (
                    <>
                      <div className="text-bone">{usd(a.debtUsd)}</div>
                      <div className="text-xs text-mist">
                        {amt(a.debtAmount)} {a.symbol}
                      </div>
                    </>
                  ) : (
                    <span className="text-mist/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-mist">
                  {(a.liquidationThreshold * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right font-mono text-mist">
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
  );
}

/**
 * The default story: ramp the single binding move (volatile collateral falling,
 * or volatile debt rising) along one Crash Severity axis. The chart's HF=1
 * crossing equals the Distance to Liquidation headline.
 */
function DefaultScenario({
  breakdown,
  direction,
  triggerFraction,
}: {
  breakdown: PositionBreakdown;
  direction: "collateral-fall" | "debt-rise";
  triggerFraction: number;
}) {
  const triggerPct = triggerFraction * 100;
  const maxPct =
    direction === "collateral-fall"
      ? Math.min(
          90,
          Math.max(Math.ceil(triggerPct * 1.6), Math.ceil(triggerPct) + 15),
        )
      : Math.min(
          300,
          Math.max(Math.ceil(triggerPct * 1.6), Math.ceil(triggerPct) + 20),
        );

  const assets = useMemo(
    () => bindingMoveAssets(breakdown, direction),
    [breakdown, direction],
  );

  // Start at the trigger so the first liquidation is visible immediately.
  const [severityPct, setSeverityPct] = useState(() =>
    Math.min(maxPct, Math.ceil(triggerPct)),
  );

  const shocks = useMemo(() => {
    const m =
      direction === "collateral-fall"
        ? 1 - severityPct / 100
        : 1 + severityPct / 100;
    const s: PriceShocks = {};
    for (const a of assets) s[a] = m;
    return s;
  }, [assets, direction, severityPct]);

  const sweep = useMemo(
    () =>
      sweepCrash(breakdown, assets, direction, maxPct).map((p) => ({
        movePct: p.movePct,
        hf:
          p.healthFactorBefore != null
            ? Number(p.healthFactorBefore.toFixed(3))
            : null,
      })),
    [breakdown, assets, direction, maxPct],
  );

  const result = useMemo(
    () => simulateCascade(breakdown, shocks),
    [breakdown, shocks],
  );

  const verb = direction === "collateral-fall" ? "fall" : "rise";
  const sign = direction === "collateral-fall" ? "−" : "+";
  const subject =
    direction === "collateral-fall" ? "volatile collateral" : "volatile debt";

  return (
    <div className="space-y-5 rounded-xl border border-steel bg-deep/40 p-5">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-bone">
            Crash severity — {subject} {verb}s together
          </span>
          <span className="font-mono text-bone">
            {sign}
            {severityPct}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={maxPct}
          value={severityPct}
          onChange={(e) => setSeverityPct(Number(e.target.value))}
          className="w-full"
          aria-label={`Crash severity, ${subject} ${verb}s together`}
        />
      </div>

      <div>
        <p className="mb-2 text-xs text-mist">
          Health factor as {subject} {verb}s together, running the full
          liquidation cascade at each step.
        </p>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sweep}
              margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
            >
              <XAxis
                dataKey="movePct"
                type="number"
                domain={[0, maxPct]}
                stroke={C.grid}
                tick={{ fontSize: 12, fill: C.axis }}
                tickFormatter={(v) => `${sign}${v}%`}
              />
              <YAxis
                stroke={C.grid}
                tick={{ fontSize: 12, fill: C.axis }}
                domain={[0, "auto"]}
              />
              <Tooltip
                contentStyle={{
                  background: C.panel,
                  border: `1px solid ${C.grid}`,
                  borderRadius: 8,
                  color: "#e7eeec",
                }}
                labelStyle={{ color: C.axis }}
                labelFormatter={(v) => `${subject} ${verb}s ${sign}${v}%`}
                formatter={(v) => [v, "Health factor (pre-liquidation)"]}
              />
              {/* Shade the region where liquidation has begun. */}
              <ReferenceArea
                x1={triggerPct}
                x2={maxPct}
                fill={C.reef}
                fillOpacity={0.08}
              />
              <ReferenceLine y={1} stroke={C.reef} strokeDasharray="4 4" />
              <ReferenceLine
                x={triggerPct}
                stroke={C.reef}
                strokeDasharray="2 3"
                label={{
                  value: "liquidation begins",
                  position: "insideTopRight",
                  fill: C.reef,
                  fontSize: 11,
                }}
              />
              <ReferenceLine
                x={0}
                stroke={C.grid}
                label={{
                  value: "today",
                  position: "insideTopLeft",
                  fill: C.now,
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="hf"
                stroke={C.trace}
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <CascadeOutcome result={result} />
    </div>
  );
}

/** Outcome headline at the current scenario, with the per-step cascade on demand. */
function CascadeOutcome({
  result,
}: {
  result: ReturnType<typeof simulateCascade>;
}) {
  const hfBefore = result.healthFactorBefore;
  const liquidated = result.events.length > 0;

  const seized = result.events.reduce((s, e) => s + e.collateralSeizedUsd, 0);
  const repaid = result.events.reduce((s, e) => s + e.debtRepaidUsd, 0);
  const penalty = seized - repaid;

  return (
    <div className="space-y-3 rounded-lg border border-steel bg-abyss/40 p-4">
      {!liquidated ? (
        <p className="text-sm text-mist">
          Health factor here:{" "}
          <span className="font-mono text-clear">
            {hfBefore != null ? hfBefore.toFixed(3) : "∞"}
          </span>
          <span className="ml-2">— no liquidation yet</span>
        </p>
      ) : (
        <>
          <p className="text-sm text-bone">
            If liquidated here: seize{" "}
            <span className="font-mono">{usd(seized)}</span> of collateral, pay{" "}
            <span className="font-mono">{usd(penalty)}</span> in penalty,{" "}
            {result.insolvent ? (
              <span className="text-reef">
                collateral exhausted with{" "}
                <span className="font-mono">{usd(result.finalDebtUsd)}</span>{" "}
                bad debt remaining.
              </span>
            ) : (
              <>
                ending at health factor{" "}
                <span className="font-mono text-clear">
                  {result.finalHealthFactor == null
                    ? "∞"
                    : result.finalHealthFactor.toFixed(3)}
                </span>
                .
              </>
            )}
          </p>

          <details className="text-sm">
            <summary className="cursor-pointer text-mist transition-colors hover:text-bone">
              {result.events.length} liquidation
              {result.events.length === 1 ? "" : "s"} — show steps
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="eyebrow">
                  <tr className="border-b border-steel text-left">
                    <th className="px-2 py-1.5 font-normal">#</th>
                    <th className="px-2 py-1.5 text-right font-normal">
                      HF before
                    </th>
                    <th className="px-2 py-1.5 text-right font-normal">
                      Repay
                    </th>
                    <th className="px-2 py-1.5 text-right font-normal">
                      Seize
                    </th>
                    <th className="px-2 py-1.5 text-right font-normal">
                      Close
                    </th>
                    <th className="px-2 py-1.5 text-right font-normal">
                      Bonus
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono text-bone">
                  {result.events.map((e) => (
                    <tr
                      key={e.step}
                      className="border-b border-steel/40 last:border-b-0"
                    >
                      <td className="px-2 py-1.5 text-mist">{e.step}</td>
                      <td className="px-2 py-1.5 text-right">
                        {e.healthFactorBefore.toFixed(3)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {usd(e.debtRepaidUsd)} {e.debtSymbol}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {usd(e.collateralSeizedUsd)} {e.collateralSymbol}
                      </td>
                      <td className="px-2 py-1.5 text-right text-mist">
                        {(e.closeFactor * 100).toFixed(0)}%
                      </td>
                      <td className="px-2 py-1.5 text-right text-mist">
                        +{(e.bonus * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

/**
 * Power-user disclosure: the full per-asset shock controls (every collateral
 * asset's fall and every volatile debt asset's rise) ramped together.
 */
function AdvancedScenario({ breakdown }: { breakdown: PositionBreakdown }) {
  const collateralAssets = useMemo(
    () =>
      [...breakdown.assets]
        .filter((a) => a.collateralUsd > 0)
        .sort((a, b) => b.collateralUsd - a.collateralUsd),
    [breakdown],
  );
  const debtAssets = useMemo(
    () =>
      [...breakdown.assets]
        .filter((a) => a.debtUsd > 0 && a.collateralUsd === 0)
        .sort((a, b) => b.debtUsd - a.debtUsd),
    [breakdown],
  );

  const [shocks, setShocks] = useState<PriceShocks>({});
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
    <details className="rounded-xl border border-steel">
      <summary className="cursor-pointer px-5 py-3.5 text-sm text-mist transition-colors hover:text-bone">
        Custom scenario — shock each price individually
      </summary>
      <div className="space-y-6 border-t border-steel px-5 py-5">
        {anyChange && (
          <div className="flex justify-end">
            <button
              onClick={() => setShocks({})}
              className="text-xs text-mist transition-colors hover:text-bone"
            >
              Reset
            </button>
          </div>
        )}

        <div className="space-y-2">
          <p className="eyebrow">Collateral falls</p>
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
          <div className="space-y-2">
            <p className="eyebrow">Debt rises</p>
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
          <p className="mb-2 text-xs text-mist">
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
                  stroke={C.grid}
                  tick={{ fontSize: 12, fill: C.axis }}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  stroke={C.grid}
                  tick={{ fontSize: 12, fill: C.axis }}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    background: C.panel,
                    border: `1px solid ${C.grid}`,
                    borderRadius: 8,
                    color: "#e7eeec",
                  }}
                  labelStyle={{ color: C.axis }}
                  labelFormatter={(v) => `Scenario intensity: ${v}%`}
                  formatter={(v) => [v, "Health factor (pre-liquidation)"]}
                />
                <ReferenceLine y={1} stroke={C.reef} strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="hf"
                  stroke={C.trace}
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <CascadeOutcome result={result} />
      </div>
    </details>
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
    <div className="space-y-1.5 py-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-bone">{symbol}</span>
        <span className="font-mono text-xs text-mist">
          {price(from)} → {price(to)}
          <span className="ml-2 text-bone">
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
        aria-label={`${symbol} price ${sign === "-" ? "fall" : "rise"}`}
      />
      {note && <p className="text-xs text-mist/80">{note}</p>}
    </div>
  );
}
