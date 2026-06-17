"use client";

import { useMemo } from "react";
import type { PositionBreakdown } from "@/lib/aave/breakdown";
import {
  distanceToLiquidation,
  liquidationOnset,
} from "@/lib/simulation/cascade";
import { SoundingGauge } from "./SoundingGauge";

const pct = (f: number) => `${(f * 100).toFixed(f < 0.1 ? 1 : 0)}%`;

const price = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4,
  });

// How close to the edge — drives the readout color.
function signal(fraction: number): "reef" | "shoal" | "clear" {
  if (fraction < 0.1) return "reef";
  if (fraction < 0.25) return "shoal";
  return "clear";
}

const SIGNAL_TEXT = {
  reef: "text-reef",
  shoal: "text-shoal",
  clear: "text-clear",
} as const;

type Reading = {
  big: string;
  tone: "reef" | "shoal" | "clear" | "neutral";
  /** Direction of the binding move — distance is a positive magnitude; this says which way the world must move. */
  dir: { arrow: string; label: string } | null;
  caption: string;
  /** Show the "Health factor X → 1.00 at liquidation" context line. */
  showHealthFactor: boolean;
};

/**
 * The headline answer: the smallest single-direction price move that brings this
 * Position's Health Factor to 1 — a positive magnitude, with the binding
 * direction stated. See docs/adr/0004 and CONTEXT.md ("Distance to Liquidation").
 */
export function Hero({ breakdown }: { breakdown: PositionBreakdown }) {
  const distance = useMemo(() => distanceToLiquidation(breakdown), [breakdown]);

  const r: Reading = useMemo(() => {
    switch (distance.kind) {
      case "collateral-fall":
        return {
          big: pct(distance.dropFraction),
          tone: signal(distance.dropFraction),
          dir: { arrow: "↓", label: "collateral fall" },
          caption:
            "Volatile collateral can fall this far, together, before liquidation begins.",
          showHealthFactor: true,
        };
      case "debt-rise":
        return {
          big: pct(distance.riseFraction),
          tone: signal(distance.riseFraction),
          dir: { arrow: "↑", label: "debt rise" },
          caption:
            "Volatile debt can rise this far, together, before liquidation begins.",
          showHealthFactor: true,
        };
      case "eligible-now":
        return {
          big: "Eligible now",
          tone: "reef",
          dir: null,
          caption:
            "Health factor is already at or below 1 — this position can be liquidated at current prices.",
          showHealthFactor: false,
        };
      case "no-debt":
        return {
          big: "No debt",
          tone: "neutral",
          dir: null,
          caption: "This position has no debt, so it cannot be liquidated.",
          showHealthFactor: false,
        };
      case "no-risk":
        return {
          big: "No price risk",
          tone: "clear",
          dir: null,
          caption:
            "No volatile price move alone brings this position to liquidation.",
          showHealthFactor: false,
        };
    }
  }, [distance]);

  const bigClass = r.tone === "neutral" ? "text-bone" : SIGNAL_TEXT[r.tone];
  const hf = breakdown.position.healthFactor;
  const onset = useMemo(() => liquidationOnset(breakdown), [breakdown]);

  const onsetLabel =
    onset == null
      ? ""
      : onset.kind === "price"
        ? `${onset.symbol} liquidation price`
        : onset.side === "collateral"
          ? "Collateral at liquidation"
          : "Debt at liquidation";
  const onsetValue =
    onset == null
      ? ""
      : onset.kind === "price"
        ? price(onset.price)
        : price(onset.usd);

  return (
    <div className="rounded-xl border border-steel bg-deep/60 p-5 sm:p-6">
      <div className="eyebrow">Distance to liquidation</div>
      <div className="mt-4 flex items-stretch gap-5 sm:gap-7">
        <SoundingGauge
          healthFactor={hf}
          height={224}
          ariaLabel={
            hf != null
              ? `Health factor ${hf.toFixed(2)}, ${r.big} from the liquidation waterline`
              : r.big
          }
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="settle flex flex-wrap items-end gap-x-3 gap-y-1">
            <span
              className={`font-mono text-5xl font-semibold leading-none tracking-tight sm:text-6xl ${bigClass}`}
            >
              {r.big}
            </span>
            {r.dir && (
              <span className="mb-1 font-mono text-xs uppercase tracking-wider text-mist">
                {r.dir.arrow} {r.dir.label}
              </span>
            )}
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-mist">
            {r.caption}
          </p>
          {r.showHealthFactor && hf != null && onset && (
            <dl className="mt-5 space-y-2 border-t border-steel pt-4 font-mono text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-mist">{onsetLabel}</dt>
                <dd className={`text-base ${bigClass}`}>{onsetValue}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-mist">Health factor</dt>
                <dd className="text-mist">
                  <span className="text-bone">{hf.toFixed(2)}</span>
                  <span className="mx-1.5 text-mist/60">→</span>
                  <span className="text-reef">1.00</span>
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
